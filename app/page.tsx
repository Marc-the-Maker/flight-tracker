'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, 
  ScatterChart, Scatter, YAxis 
} from 'recharts';
import Link from 'next/link';
import { Plane, Calendar, Clock, Map, Plus } from 'lucide-react';

export default function Home() {
  const [flights, setFlights] = useState<any[]>([]);
  const [graphMode, setGraphMode] = useState<'flights' | 'km' | 'time'>('flights');
  const [airportDb, setAirportDb] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      // 1. Get Flights
      const { data } = await supabase.from('flights').select('*').order('date', { ascending: true });
      if (data) setFlights(data);

      // 2. Get Airport DB
      const res = await fetch('https://raw.githubusercontent.com/mwgg/Airports/master/airports.json');
      if (res.ok) {
        const airports = await res.json();
        setAirportDb(Object.values(airports));
      }
    };
    fetchData();
  }, []);

  // --- HELPER: ROBUST LOCAL CHECK ---
  const isSouthAfrican = (code: string) => {
    // 1. Find airport in DB
    const airport = airportDb.find((a: any) => a.iata === code || a.icao === code);
    
    if (airport) {
      // Check Country Name (Handles "South Africa", "Republic of South Africa", etc)
      const country = airport.country?.toLowerCase() || "";
      if (country.includes("south africa")) return true;
      
      // Check ICAO Code (South African airports start with FA..)
      if (airport.icao?.startsWith("FA")) return true;
    }
    
    // 2. Fallback: If DB lookup failed, check known major codes directly
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

  // --- GRAPH DATA ---
  const getGraphData = () => {
    const today = new Date();
    const months = [];
    
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      months.push({
        name: d.toLocaleString('default', { month: 'short' }),
        key: `${d.getFullYear()}-${d.getMonth()}`,
      });
    }

    if (graphMode === 'flights') {
      // --- SCATTER CHART (DOTS) ---
      const scatterPoints: any[] = [];
      
      months.forEach((m) => {
        const monthFlights = flights.filter(f => {
          const fd = new Date(f.date);
          return `${fd.getFullYear()}-${fd.getMonth()}` === m.key;
        });

        monthFlights.forEach((f, stackIndex) => {
          // Check if Local (Starts AND Ends in ZA)
          const originIsZA = isSouthAfrican(f.origin);
          const destIsZA = isSouthAfrican(f.destination);
          
          const isLocal = originIsZA && destIsZA;

          scatterPoints.push({
            x: m.name,
            y: stackIndex + 1,
            z: 1,
            fill: isLocal ? '#22c55e' : '#f97316', // Green (Local) vs Orange (Intl)
            tooltip: `${f.origin} ➝ ${f.destination}`
          });
        });
      });
      return scatterPoints;

    } else {
      // --- BAR CHART (KM / TIME) ---
      return months.map(m => {
        const monthFlights = flights.filter(f => {
          const fd = new Date(f.date);
          return `${fd.getFullYear()}-${fd.getMonth()}` === m.key;
        });

        let val = 0;
        if (graphMode === 'km') val = monthFlights.reduce((a, c) => a + (c.distance_km || 0), 0);
        if (graphMode === 'time') val = Math.floor(monthFlights.reduce((a, c) => a + (c.duration_min || 0), 0) / 60);

        return { name: m.name, value: val };
      });
    }
  };

  const graphData = getGraphData();

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

      {/* ANALYTICS CARD */}
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

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            {graphMode === 'flights' ? (
              <ScatterChart margin={{ top: 10, right: 0, bottom: 0, left: -20 }}>
                <XAxis type="category" dataKey="x" interval={0} tick={{fontSize: 10}} axisLine={false} tickLine={false} />
                <YAxis type="number" dataKey="y" hide domain={[0, 'auto']} />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<CustomTooltip />} />
                <Scatter data={graphData} line={false} />
              </ScatterChart>
            ) : (
              <BarChart data={graphData} margin={{ top: 10, right: 0, bottom: 0, left: -20 }}>
                <XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false} />
                <Tooltip cursor={{fill: '#f3f4f6'}} />
                <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
        
        {/* LEGEND - UPDATED TO 'LOCAL' */}
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
    const data = payload[0].payload;
    return (
      <div className="bg-gray-900 text-white text-xs p-2 rounded shadow-xl z-50">
        <div className="font-bold">{data.tooltip}</div>
        <div className="opacity-75">{data.x}</div>
      </div>
    );
  }
  return null;
};