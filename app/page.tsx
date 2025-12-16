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

  const getGraphData = () => {
    const today = new Date();
    const months = [];
    
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      months.push({
        name: d.toLocaleString('default', { month: 'short' }),
        key: `${d.getFullYear()}-${d.getMonth()}`,
        barValue: 0,
        scatterPoints: [] as any[]
      });
    }

    let yLimit = 4;
    
    months.forEach((m) => {
      const monthFlights = flights.filter(f => {
        const fd = new Date(f.date);
        return `${fd.getFullYear()}-${fd.getMonth()}` === m.key;
      });

      if (graphMode === 'flights') {
        if (monthFlights.length + 1 > yLimit) yLimit = monthFlights.length + 1;

        monthFlights.forEach((f, index) => {
           const originIsZA = isSouthAfrican(f.origin);
           const destIsZA = isSouthAfrican(f.destination);
           const isLocal = originIsZA && destIsZA;

           m.scatterPoints.push({
               x: m.name,
               y: index + 1,
               fill: isLocal ? '#22c55e' : '#f97316', // Green/Orange preserved for data logic
               tooltip: `${f.origin} ➝ ${f.destination}`
           });
        });
        m.barValue = 0.1; 

      } else {
        let val = 0;
        if (graphMode === 'km') val = monthFlights.reduce((a, c) => a + (c.distance_km || 0), 0);
        if (graphMode === 'time') val = Math.floor(monthFlights.reduce((a, c) => a + (c.duration_min || 0), 0) / 60);
        m.barValue = val;
      }
    });

    const flatScatterData = months.flatMap(m => m.scatterPoints);
    const yTicks = Array.from({length: yLimit + 1}, (_, i) => i);

    return { chartData: months, flatScatterData, yLimit, yTicks };
  };

  const { chartData, flatScatterData, yLimit, yTicks } = getGraphData();

  // Custom Bar for Dot Stacking
  const CustomBar = (props: any) => {
    const { x, y, width, height, payload } = props;
    if (graphMode !== 'flights' || payload.value === 0) {
        return <path d={`M${x},${y + height} L${x + width},${y + height} L${x + width},${y} L${x},${y} Z`} fill="#FF2800" />;
    }
    return (
      <g>
        {payload.scatterPoints.map((pt: any, index: number) => {
            const dotY = (y + height) - (index * 15) - 10;
            return <circle key={index} cx={x + width / 2} cy={dotY} r={5} fill={pt.fill} />;
        })}
      </g>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-24">
      {/* HEADER */}
      <div className="flex justify-between items-center mb-8">
        <div>
           <h1 className="text-3xl font-black text-gray-900 uppercase tracking-tight leading-none">
             MARC&apos;S <br/> <span className="text-[#FF2800]">FLIGHT TRACKER</span>
           </h1>
        </div>
        <Link href="/flights" className="bg-[#FF2800] text-white p-3 rounded-full shadow-lg shadow-[#FF2800]/20 hover:scale-105 transition-transform">
           <Plus size={24} />
        </Link>
      </div>

      {/* STATS */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <StatCard icon={<Plane size={18} className="text-[#FF2800]"/>} label="Flights" value={stats.count} sub={`${stats.countYTD} YTD`} />
        <StatCard icon={<Map size={18} className="text-[#FF2800]"/>} label="Distance" value={`${(stats.km/1000).toFixed(1)}k`} unit="km" sub={`${(stats.kmYTD/1000).toFixed(1)}k YTD`} />
        <StatCard icon={<Clock size={18} className="text-[#FF2800]"/>} label="Time" value={Math.floor(stats.time/60)} unit="h" sub={`${Math.floor(stats.timeYTD/60)}h YTD`} />
        <StatCard icon={<Calendar size={18} className="text-[#FF2800]"/>} label="Avg Dist" value={stats.count > 0 ? Math.round(stats.km/stats.count) : 0} unit="km" sub="per flight" />
      </div>

      {/* ANALYTICS */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex justify-between items-center mb-6">
          <h2 className="font-bold text-gray-800 text-lg">Analytics</h2>
          <div className="flex bg-gray-100 rounded-lg p-1">
            {['flights', 'km', 'time'].map(m => (
              <button key={m} onClick={() => setGraphMode(m as any)}
                className={`px-3 py-1 text-xs font-bold capitalize rounded-md transition-all ${graphMode === m ? 'bg-white text-[#FF2800] shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>
                {m}
              </button>
            ))}
          </div>
        </div>

        <div style={{ width: '100%', height: '300px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 0, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false} tick={{fill: '#9ca3af'}} />
                <YAxis fontSize={10} axisLine={false} tickLine={false} tick={{fill: '#9ca3af'}} allowDecimals={graphMode !== 'flights'} />
                <Tooltip cursor={{fill: '#f9fafb', opacity: 0.5}} content={<CustomTooltip mode={graphMode} />} />
                
                {/* Custom Red Bar */}
                <Bar 
                    dataKey="barValue" 
                    shape={<CustomBar />}
                    fill="#FF2800" 
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={false} 
                />
            </BarChart>
          </ResponsiveContainer>
        </div>
        
        {graphMode === 'flights' && (
           <div className="flex justify-center gap-4 mt-4 text-xs font-semibold text-gray-500">
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-500"></div> Local (ZA)</div>
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-orange-500"></div> International</div>
           </div>
        )}
      </div>

      {/* FLOATING ACTION BUTTON */}
      <div className="fixed bottom-6 left-0 right-0 flex justify-center pointer-events-none">
         <Link href="/flights" className="bg-[#FF2800] text-white px-6 py-3 rounded-full shadow-xl shadow-[#FF2800]/30 font-bold text-sm pointer-events-auto flex items-center gap-2 hover:bg-red-600 transition-colors">
            View Flight Log <Plane size={16}/>
         </Link>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, sub, unit }: any) {
  return (
    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between h-28 hover:shadow-md transition-shadow">
      <div className="text-gray-400 mb-1">{icon}</div>
      <div>
        <div className="text-2xl font-black text-gray-900">{value}<span className="text-sm text-gray-400 font-normal ml-1">{unit}</span></div>
        <div className="text-xs text-gray-500 font-bold uppercase tracking-wider">{label}</div>
        <div className="text-[10px] text-[#FF2800] mt-1 font-semibold opacity-80">{sub}</div>
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, mode }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    if (mode === 'flights' && data.scatterPoints && data.scatterPoints.length > 0) {
        return (
            <div className="bg-gray-900 text-white text-xs p-3 rounded-lg shadow-xl z-50">
                <div className="font-bold mb-2 text-gray-400 border-b border-gray-700 pb-1">{data.name}</div>
                {data.scatterPoints.map((pt: any, i: number) => (
                    <div key={i} className="mb-1 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{backgroundColor: pt.fill}}></div>
                        {pt.tooltip}
                    </div>
                ))}
            </div>
        );
    }
    return (
        <div className="bg-gray-900 text-white text-xs p-2 rounded shadow-xl z-50">
            <div className="font-bold text-[#FF2800] text-lg">{payload[0].value}</div>
            <div className="opacity-75 uppercase text-[10px] tracking-wider">{data.name}</div>
        </div>
    );
  }
  return null;
};