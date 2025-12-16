'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

// Simple Airport Type
type Leg = { from: string; to: string; date: string; airline: string };

export default function FlightsPage() {
  const router = useRouter();
  const [view, setView] = useState<'list' | 'add'>('list');
  const [flights, setFlights] = useState<any[]>([]);
  
  // Add Flight Form State
  const [isReturn, setIsReturn] = useState(true);
  const [legs, setLegs] = useState<Leg[]>([{ from: '', to: '', date: '', airline: '' }]);
  const [airportQuery, setAirportQuery] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    const { data } = await supabase.from('flights').select('*').order('date', { ascending: false });
    if (data) setFlights(data);
  };

  // --- AUTOCOMPLETE LOGIC ---
  // We use a public simplified airport list for this demo
  const searchAirports = async (query: string) => {
    if (query.length < 3) return;
    try {
      // In a real app, you'd host a JSON or use a proper API. 
      // For this demo, we assume the user types the 3 letter code or we use a basic fetch
      // If you want full name search, we need a larger dataset.
      const res = await fetch(`https://raw.githubusercontent.com/mwgg/Airports/master/airports.json`);
      const data = await res.json();
      const filtered = Object.values(data).filter((a: any) => 
        a.iata.toLowerCase().includes(query.toLowerCase()) || 
        a.city.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 5);
      setSuggestions(filtered);
    } catch (e) { console.error(e); }
  };

  const handleLegChange = (index: number, field: keyof Leg, value: string) => {
    const newLegs = [...legs];
    newLegs[index][field] = value.toUpperCase();
    
    // --- SMART CHAINING LOGIC ---
    if (field === 'to') {
      // If we set arrival for leg X, set departure for leg X+1
      if (index + 1 < newLegs.length) {
        newLegs[index + 1].from = value.toUpperCase();
      }
      // If it's the first leg and Return is ON, set the LAST leg arrival
      if (index === 0 && isReturn) {
         newLegs[newLegs.length - 1].to = newLegs[0].from; // Return to origin
      }
    }
    
    setLegs(newLegs);
  };

  const addLeg = () => {
    const lastLeg = legs[legs.length - 1];
    // New leg starts where the last one ended
    setLegs([...legs, { from: lastLeg.to, to: '', date: '', airline: '' }]);
  };

  const handleSubmit = async () => {
    // Generate return leg if needed
    let finalLegs = [...legs];
    if (isReturn) {
      const first = legs[0];
      const last = legs[legs.length - 1];
      // Add the return flight
      finalLegs.push({ from: last.to, to: first.from, date: '', airline: '' });
    }

    // Save to Supabase
    for (const leg of finalLegs) {
      if(!leg.from || !leg.to) continue;
      await supabase.from('flights').insert({
        date: leg.date || new Date().toISOString(),
        origin: leg.from,
        destination: leg.to,
        airline: leg.airline,
        distance_km: 1000, // Placeholder: You'd calculate this with lat/lon normally
        duration_min: 120  // Placeholder
      });
    }
    
    setView('list');
    fetchHistory();
  };

  if (view === 'add') {
    return (
      <div className="p-4 bg-gray-50 min-h-screen">
        <h2 className="text-xl font-bold mb-4">Add Trip</h2>
        <div className="space-y-4">
          <div className="flex gap-4 mb-4">
            <button onClick={() => setIsReturn(false)} className={`p-2 rounded ${!isReturn ? 'bg-blue-600 text-white' : 'bg-white'}`}>One Way</button>
            <button onClick={() => setIsReturn(true)} className={`p-2 rounded ${isReturn ? 'bg-blue-600 text-white' : 'bg-white'}`}>Return</button>
          </div>

          {legs.map((leg, i) => (
            <div key={i} className="bg-white p-4 rounded shadow-sm space-y-3">
              <div className="font-bold text-gray-400 text-xs">FLIGHT {i + 1}</div>
              <div className="grid grid-cols-2 gap-2">
                <input placeholder="From (CPT)" value={leg.from} onChange={(e) => handleLegChange(i, 'from', e.target.value)} className="border p-2 rounded" />
                <input placeholder="To (DXB)" value={leg.to} onChange={(e) => handleLegChange(i, 'to', e.target.value)} className="border p-2 rounded" />
              </div>
              <input type="date" onChange={(e) => handleLegChange(i, 'date', e.target.value)} className="w-full border p-2 rounded" />
              <input placeholder="Airline" onChange={(e) => handleLegChange(i, 'airline', e.target.value)} className="w-full border p-2 rounded" />
            </div>
          ))}

          <button onClick={addLeg} className="text-blue-600 text-sm font-semibold">+ Add Stopover</button>

          <div className="pt-4 flex gap-2">
            <button onClick={handleSubmit} className="flex-1 bg-green-600 text-white p-3 rounded-lg font-bold">Save Trip</button>
            <button onClick={() => setView('list')} className="bg-gray-300 text-black p-3 rounded-lg">Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-gray-50 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">My Logbook</h1>
        <Link href="/" className="text-blue-600">Dashboard</Link>
      </div>

      <button onClick={() => setView('add')} className="w-full bg-blue-600 text-white p-3 rounded-lg mb-6 font-bold">
        + Log New Trip
      </button>

      <div className="space-y-3">
        {flights.map((f) => (
          <div key={f.id} className="bg-white p-4 rounded-xl shadow-sm flex justify-between items-center">
            <div>
              <div className="font-bold text-lg">{f.origin} ➝ {f.destination}</div>
              <div className="text-gray-500 text-sm">{f.date}</div>
            </div>
            <div className="text-right">
              <div className="text-gray-600 font-mono text-sm">{f.distance_km}km</div>
              <div className="text-gray-400 text-xs">{f.airline}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}