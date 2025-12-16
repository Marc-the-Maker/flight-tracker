'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import Link from 'next/link';
import { Plane, Calendar, Clock, Map } from 'lucide-react';

export default function Home() {
  const [flights, setFlights] = useState<any[]>([]);
  const [graphMode, setGraphMode] = useState<'flights' | 'km' | 'time'>('flights');

  useEffect(() => {
    const fetchFlights = async () => {
      const { data } = await supabase.from('flights').select('*').order('date', { ascending: true });
      if (data) setFlights(data);
    };
    fetchFlights();
  }, []);

  // --- STATS CALCULATION ---
  const currentYear = new Date().getFullYear();
  const ytdFlights = flights.filter(f => new Date(f.date).getFullYear() === currentYear);

  const stats = {
    totalFlights: flights.length,
    flightsYTD: ytdFlights.length,
    kmTotal: flights.reduce((acc, curr) => acc + (curr.distance_km || 0), 0),
    kmYTD: ytdFlights.reduce((acc, curr) => acc + (curr.distance_km || 0), 0),
    timeTotal: flights.reduce((acc, curr) => acc + (curr.duration_min || 0), 0),
    timeYTD: ytdFlights.reduce((acc, curr) => acc + (curr.duration_min || 0), 0),
  };

  // --- GRAPH DATA PREP (Last 12 Months) ---
  const getGraphData = () => {
    const data = [];
    const today = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const monthName = d.toLocaleString('default', { month: 'short' });
      const monthKey = `${d.getFullYear()}-${d.getMonth()}`; // Unique key
      
      const monthFlights = flights.filter(f => {
        const fd = new Date(f.date);
        return `${fd.getFullYear()}-${fd.getMonth()}` === monthKey;
      });

      let value = 0;
      if (graphMode === 'flights') value = monthFlights.length;
      if (graphMode === 'km') value = monthFlights.reduce((a, c) => a + (c.distance_km || 0), 0);
      if (graphMode === 'time') value = monthFlights.reduce((a, c) => a + (c.duration_min || 0), 0) / 60; // Hours

      data.push({ name: monthName, value });
    }
    return data;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-20">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Flight Tracker</h1>
      </header>

      {/* STATS GRID */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <StatCard icon={<Plane />} label="Total Flights" value={stats.totalFlights} sub={`YTD: ${stats.flightsYTD}`} />
        <StatCard icon={<Map />} label="Distance (km)" value={stats.kmTotal.toLocaleString()} sub={`YTD: ${stats.kmYTD.toLocaleString()}`} />
        <StatCard icon={<Clock />} label="Hours Flown" value={Math.floor(stats.timeTotal / 60)} sub={`YTD: ${Math.floor(stats.timeYTD / 60)}h`} />
      </div>

      {/* GRAPH SECTION */}
      <div className="bg-white p-4 rounded-xl shadow-sm mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold text-gray-700">Analytics</h2>
          <div className="flex bg-gray-100 rounded-lg p-1 text-xs">
            {['flights', 'km', 'time'].map((m) => (
              <button
                key={m}
                onClick={() => setGraphMode(m as any)}
                className={`px-3 py-1 rounded-md capitalize ${graphMode === m ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={getGraphData()}>
              <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip />
              <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* FAB BUTTON */}
      <Link href="/flights" className="fixed bottom-6 right-6 bg-blue-600 text-white p-4 rounded-full shadow-lg">
        View & Add Flights
      </Link>
    </div>
  );
}

function StatCard({ icon, label, value, sub }: any) {
  return (
    <div className="bg-white p-4 rounded-xl shadow-sm flex flex-col justify-between">
      <div className="text-blue-500 mb-2">{icon}</div>
      <div>
        <div className="text-2xl font-bold text-gray-800">{value}</div>
        <div className="text-xs text-gray-500 uppercase font-semibold">{label}</div>
        <div className="text-xs text-gray-400 mt-1">{sub}</div>
      </div>
    </div>
  );
}