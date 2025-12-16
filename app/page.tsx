'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Bar, XAxis, Tooltip, ResponsiveContainer, 
  ComposedChart, Scatter, YAxis, CartesianGrid, Cell
} from 'recharts';
import Link from 'next/link';
import { Plane, Calendar, Clock, Map, Plus } from 'lucide-react';

export default function Home() {
  const [flights, setFlights] = useState<any[]>([]);
  const [graphMode, setGraphMode] = useState<'flights' | 'km' | 'time'>('flights');
  const [airportDb, setAirportDb] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      const { data } = await supabase.from('flights').select('*').order('date', { ascending: true });
      if (data) setFlights(data);

      const res = await fetch('https://raw.githubusercontent.com/mwgg/Airports/master/airports.json');
      if (res.ok) {
        const airports = await res.json();
        setAirportDb(Object.values(airports));
      }
    };
    fetchData();
  }, []);

  // --- HELPER: LOCAL CHECK ---
  const isSouthAfrican = (code: string) => {
    const airport = airportDb.find((a: any) => a.iata === code || a.icao === code);
    if (airport) {
      const country = airport.country?.toLowerCase() || "";
      if (country.includes("south africa")) return true;
      if (airport.icao?.startsWith("FA")) return true;
    }
    const localCodes = ['JNB', 'CPT', 'DUR', 'HLA', 'GRJ', 'PLZ', 'ELS', 'KIM', 'BFN', 'MQP', 'PTG', 'UTH', 'RCB', 'PBZ', 'LNO', 'PHW', 'NTY', 'SIS', 'ZEC'];
    if (localCodes.includes(code)) return true;
    return false;
  };

  // --- STATS ---
  const currentYear = new Date().getFullYear();
  const ytdFlights = flights.filter(f => new Date(f.date).getFullYear() === currentYear);

  const stats = {
    count: flights.length,
    countYTD: ytdFlights.length,
    km: flights.reduce((a, c) => a + (c.distance_km || 0), 0),
    kmYTD: ytdFlights.reduce((a, c) => a + (c.distance_km || 0), 0),
    time: flights.reduce((a, c) => a + (c.duration_min || 0), 0),
    timeYTD: ytdFlights.reduce((a, c) => a + (c.duration_min || 0), 0),
  };

  // --- GRAPH DATA ENGINE ---
  const getGraphData = () => {
    const today = new Date();
    const months = [];
    
    // 1. Create 12-Month Skeleton
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      months.push({
        name: d.toLocaleString('default', { month: 'short' }),
        key: `${d.getFullYear()}-${d.getMonth()}`,
        // These will be filled below
        barValue: 0,
        scatterPoints: [] as any[]
      });
    }

    let yLimit = 4;
    
    // 2. Populate Data
    months.forEach((m) => {
      const monthFlights = flights.filter(f => {
        const fd = new Date(f.date);
        return `${fd.getFullYear()}-${fd.getMonth()}` === m.key;
      });

      if (graphMode === 'flights') {
        // FLIGHTS MODE: We prepare a list of dots for this specific month
        // We calculate the Y-Limit based on the busiest month
        if (monthFlights.length + 1 > yLimit) yLimit = monthFlights.length + 1;

        monthFlights.forEach((f, index) => {
           const originIsZA = isSouthAfrican(f.origin);
           const destIsZA = isSouthAfrican(f.destination);
           const isLocal = originIsZA && destIsZA;

           m.scatterPoints.push({
               x: m.name,
               y: index + 1, // Stack height
               fill: isLocal ? '#22c55e' : '#f97316',
               tooltip: `${f.origin} ➝ ${f.destination}`
           });
        });
        // Important: Set barValue to something tiny so the bar exists (ghost bar) but is invisible
        m.barValue = 0.1; 

      } else {
        // KM or TIME MODE
        let val = 0;
        if (graphMode === 'km') val = monthFlights.reduce((a, c) => a + (c.distance_km || 0), 0);
        if (graphMode === 'time') val = Math.floor(monthFlights.reduce((a, c) => a + (c.duration_min || 0), 0) / 60);
        m.barValue = val;
      }
    });

    // Flatten scatter data for the Scatter component
    const flatScatterData = months.flatMap(m => m.scatterPoints);
    const yTicks = Array.from({length: yLimit + 1}, (_, i) => i);

    return { chartData: months, flatScatterData, yLimit, yTicks };
  };

  const { chartData, flatScatterData, yLimit, yTicks } = getGraphData();

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-24">
      {/* HEADER */}
      <div className="flex justify-between items-center mb-6">
        <div>
           <h1 className="text-2xl font-bold text-gray-900">Flight Tracker</h1>
           <div className="text-xs text-gray-400 font-medium">WELCOME BACK</div>
        </div>
        <Link href="/flights" className="bg-blue-600 text-white p-2 rounded-full shadow-lg">
           <Plus />
        </Link>
      </div>

      {/* STATS */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <StatCard icon={<Plane size={18}/>} label="Flights" value={stats.count} sub={`${stats.countYTD} YTD`} />
        <StatCard icon={<Map size={18}/>} label="Distance" value={`${(stats.km/1000).toFixed(1)}k`} unit="km" sub={`${(stats.kmYTD/1000).toFixed(1)}k YTD`} />
        <StatCard icon={<Clock size={18}/>} label="Time" value={Math.floor(stats.time/60)} unit="h" sub={`${Math.floor(stats.timeYTD/60)}h YTD`} />
        <StatCard icon={<Calendar size={18}/>} label="Avg Dist" value={stats.count > 0 ? Math.round(stats.km/stats.count) : 0} unit="km" sub="per flight" />
      </div>

      {/* GRAPH CARD */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex justify-between items-center mb-6">
          <h2 className="font-bold text-gray-700">Analytics</h2>
          <div className="flex bg-gray-100 rounded-lg p-1">
            {['flights', 'km', 'time'].map(m => (
              <button key={m} onClick={() => setGraphMode(m as any)}
                className={`px-3 py-1 text-xs font-bold capitalize rounded-md transition-all ${graphMode === m ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'}`}>
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* FORCE HEIGHT HERE to prevent collapse */}
        <div style={{ width: '100%', height: '300px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 0, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={true} horizontal={true} stroke="#f3f4f6" />
                
                <XAxis 
                    dataKey="name" 
                    scale="band" 
                    padding={{ left: 10, right: 10 }}
                    fontSize={10} 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fill: '#9ca3af'}} 
                />

                {graphMode === 'flights' ? (
                   <YAxis 
                        type="number" 
                        domain={[0, yLimit]} 
                        ticks={yTicks}
                        fontSize={10} 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{fill: '#9ca3af'}} 
                   />
                ) : (
                   <YAxis fontSize={10} axisLine={false} tickLine={false} tick={{fill: '#9ca3af'}} />
                )}
                
                <Tooltip cursor={{fill: '#f9fafb', opacity: 0.5}} content={<CustomTooltip />} />

                {/* THE BARS (Ghost or Real) */}
                <Bar 
                    dataKey="barValue" 
                    isAnimationActive={false} // Disable animation to fix flickering
                    fill={graphMode === 'flights' ? 'transparent' : '#3b82f6'} 
                    radius={[4, 4, 0, 0]}
                />

                {/* THE DOTS */}
                {graphMode === 'flights' && (
                    <Scatter 
                        data={flatScatterData} 
                        isAnimationActive={false} // Disable animation
                    >
                        {flatScatterData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                    </Scatter>
                )}

            </ComposedChart>
          </ResponsiveContainer>
        </div>
        
        {graphMode === 'flights' && (
           <div className="flex justify-center gap-4 mt-4 text-xs font-semibold text-gray-500">
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-500"></div> Local (ZA)</div>
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-orange-500"></div> International</div>
           </div>
        )}
      </div>

      <div className="fixed bottom-6 left-0 right-0 flex justify-center pointer-events-none">
         <Link href="/flights" className="bg-gray-900 text-white px-6 py-3 rounded-full shadow-xl font-bold text-sm pointer-events-auto flex items-center gap-2">
            View All Flights <Plane size={16}/>
         </Link>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, sub, unit }: any) {
  return (
    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between h-28">
      <div className="text-gray-400 mb-1">{icon}</div>
      <div>
        <div className="text-2xl font-bold text-gray-900">{value}<span className="text-sm text-gray-400 font-normal ml-1">{unit}</span></div>
        <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide">{label}</div>
        <div className="text-[10px] text-blue-500 mt-1 font-medium">{sub}</div>
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    // When hovering over the "Ghost Bar", we might get bar data. 
    // We want to ignore that if we are in flights mode.
    
    // Check if we are hovering a Scatter point
    const scatterPoint = payload.find((p: any) => p.dataKey === undefined); // Scatter points often have undefined dataKey in this context or carry 'x'/'y' payload
    
    // If we have a scatter point payload (it usually carries the 'tooltip' prop we passed)
    if (scatterPoint && scatterPoint.payload.tooltip) {
        return (
            <div className="bg-gray-900 text-white text-xs p-2 rounded shadow-xl z-50">
                <div className="font-bold">{scatterPoint.payload.tooltip}</div>
                <div className="opacity-75">{scatterPoint.payload.x}</div>
            </div>
        );
    }
    
    // Fallback for Bar Chart (KM/Time)
    // We check if value > 1 (since we set ghost bar to 0.1)
    if (payload[0].value > 1) {
        return (
            <div className="bg-gray-900 text-white text-xs p-2 rounded shadow-xl z-50">
                <div className="font-bold">{payload[0].value}</div>
                <div className="opacity-75">{payload[0].payload.name}</div>
            </div>
        );
    }
  }
  return null;
};