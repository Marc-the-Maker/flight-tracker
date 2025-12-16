'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Trash2, Plus, Plane } from 'lucide-react';

type Leg = { 
  from: string; 
  to: string; 
  date: string; 
  airline: string 
};

export default function FlightsPage() {
  const router = useRouter();
  const [view, setView] = useState<'list' | 'add'>('list');
  const [flights, setFlights] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Form State
  const [tripType, setTripType] = useState<'one-way' | 'return' | 'multi'>('return');
  const [legs, setLegs] = useState<Leg[]>([
    { from: '', to: '', date: new Date().toISOString().split('T')[0], airline: '' },
    { from: '', to: '', date: new Date().toISOString().split('T')[0], airline: '' } // Default return leg
  ]);

  // Autocomplete State
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [activeSearch, setActiveSearch] = useState<{ index: number, field: 'from' | 'to' } | null>(null);
  const [airportList, setAirportList] = useState<any[]>([]);

  // Load History & Airport DB
  useEffect(() => {
    fetchHistory();
    // Load airport database once on mount
    fetch('https://raw.githubusercontent.com/mwgg/Airports/master/airports.json')
      .then(res => res.json())
      .then(data => setAirportList(Object.values(data)))
      .catch(err => console.error("Failed to load airports", err));
  }, []);

  const fetchHistory = async () => {
    const { data } = await supabase.from('flights').select('*').order('date', { ascending: false });
    if (data) setFlights(data);
  };

  // --- LOGIC HANDLERS ---

  const handleTripTypeChange = (type: 'one-way' | 'return' | 'multi') => {
    setTripType(type);
    if (type === 'one-way') {
      setLegs([legs[0]]); // Keep only first leg
    } else if (type === 'return') {
      // Ensure we have exactly 2 legs
      setLegs([
        legs[0], 
        { from: legs[0].to, to: legs[0].from, date: legs[0].date, airline: '' }
      ]);
    }
  };

  const updateLeg = (index: number, field: keyof Leg, value: string) => {
    const newLegs = [...legs];
    newLegs[index][field] = value;

    // Logic: If updating "To" on Leg 1 in a Return trip, update "From" on Leg 2
    if (tripType === 'return' && index === 0 && field === 'to') {
      if (newLegs[1]) newLegs[1].from = value;
    }
    // Logic: If updating "From" on Leg 1 in a Return trip, update "To" on Leg 2
    if (tripType === 'return' && index === 0 && field === 'from') {
        if (newLegs[1]) newLegs[1].to = value;
    }

    setLegs(newLegs);

    // Trigger Search if typing airport
    if (field === 'from' || field === 'to') {
      if (value.length > 1) {
        const results = airportList.filter((a: any) => 
          a.iata.toLowerCase().includes(value.toLowerCase()) || 
          a.city.toLowerCase().includes(value.toLowerCase())
        ).slice(0, 5); // Limit to 5 results
        setSuggestions(results);
        setActiveSearch({ index, field });
      } else {
        setActiveSearch(null);
      }
    }
  };

  const selectAirport = (airport: any) => {
    if (!activeSearch) return;
    updateLeg(activeSearch.index, activeSearch.field, airport.iata);
    setActiveSearch(null); // Hide dropdown
  };

  const saveTrip = async () => {
    setLoading(true);
    const flightsToSave = legs.map(leg => ({
        date: leg.date,
        origin: leg.from.toUpperCase(),
        destination: leg.to.toUpperCase(),
        airline: leg.airline || null, // Optional
        distance_km: 0, // Placeholder for now
        duration_min: 0 // Placeholder
    }));

    // Filter out empty legs
    const validFlights = flightsToSave.filter(f => f.origin && f.destination);

    if (validFlights.length === 0) {
        alert("Please fill in at least one flight leg");
        setLoading(false);
        return;
    }

    const { error } = await supabase.from('flights').insert(validFlights);

    if (error) {
        alert("Error saving: " + error.message);
    } else {
        setView('list');
        fetchHistory();
    }
    setLoading(false);
  };

  // --- RENDER ---

  if (view === 'add') {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <h2 className="text-2xl font-bold mb-6 text-gray-900">Add Trip</h2>

        {/* TRIP TYPE TABS */}
        <div className="flex bg-gray-200 p-1 rounded-lg mb-6">
          {(['one-way', 'return', 'multi'] as const).map((t) => (
            <button
              key={t}
              onClick={() => handleTripTypeChange(t)}
              className={`flex-1 py-2 text-sm font-semibold rounded-md capitalize ${tripType === t ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}
            >
              {t.replace('-', ' ')}
            </button>
          ))}
        </div>

        {/* FLIGHT LEGS FORM */}
        <div className="space-y-4">
          {legs.map((leg, i) => (
            <div key={i} className="bg-white p-5 rounded-xl shadow-sm relative border border-gray-100">
              <div className="text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider">Flight {i + 1}</div>
              
              <div className="grid grid-cols-2 gap-4 mb-4 relative">
                {/* FROM INPUT */}
                <div className="relative">
                    <label className="text-xs text-gray-500 block mb-1">From</label>
                    <input 
                        value={leg.from}
                        onChange={(e) => updateLeg(i, 'from', e.target.value)}
                        placeholder="CPT"
                        className="w-full p-3 bg-gray-50 rounded-lg border border-gray-200 font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none uppercase"
                    />
                    {/* DROPDOWN - Shows only if this specific input is active */}
                    {activeSearch?.index === i && activeSearch?.field === 'from' && suggestions.length > 0 && (
                        <div className="absolute z-10 top-full left-0 w-full bg-white shadow-xl rounded-lg mt-1 border border-gray-100 max-h-48 overflow-auto">
                            {suggestions.map((s, idx) => (
                                <div key={idx} onClick={() => selectAirport(s)} className="p-3 border-b border-gray-50 hover:bg-blue-50 cursor-pointer">
                                    <div className="font-bold text-gray-900">{s.iata}</div>
                                    <div className="text-xs text-gray-500">{s.city}, {s.country}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* TO INPUT */}
                <div className="relative">
                    <label className="text-xs text-gray-500 block mb-1">To</label>
                    <input 
                        value={leg.to}
                        onChange={(e) => updateLeg(i, 'to', e.target.value)}
                        placeholder="LHR"
                        className="w-full p-3 bg-gray-50 rounded-lg border border-gray-200 font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none uppercase"
                    />
                    {/* DROPDOWN - Shows only if this specific input is active */}
                    {activeSearch?.index === i && activeSearch?.field === 'to' && suggestions.length > 0 && (
                        <div className="absolute z-10 top-full left-0 w-full bg-white shadow-xl rounded-lg mt-1 border border-gray-100 max-h-48 overflow-auto">
                            {suggestions.map((s, idx) => (
                                <div key={idx} onClick={() => selectAirport(s)} className="p-3 border-b border-gray-50 hover:bg-blue-50 cursor-pointer">
                                    <div className="font-bold text-gray-900">{s.iata}</div>
                                    <div className="text-xs text-gray-500">{s.city}, {s.country}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="text-xs text-gray-500 block mb-1">Date</label>
                    <input 
                        type="date"
                        value={leg.date}
                        onChange={(e) => updateLeg(i, 'date', e.target.value)}
                        className="w-full p-3 bg-gray-50 rounded-lg border border-gray-200 text-gray-900 text-sm"
                    />
                </div>
                <div>
                    <label className="text-xs text-gray-500 block mb-1">Airline (Optional)</label>
                    <input 
                        value={leg.airline}
                        onChange={(e) => updateLeg(i, 'airline', e.target.value)}
                        placeholder="Emirates"
                        className="w-full p-3 bg-gray-50 rounded-lg border border-gray-200 text-gray-900 text-sm"
                    />
                </div>
              </div>

              {tripType === 'multi' && i > 0 && (
                <button onClick={() => setLegs(legs.filter((_, idx) => idx !== i))} className="absolute top-4 right-4 text-red-400 p-1">
                    <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}

          {tripType === 'multi' && (
            <button 
                onClick={() => setLegs([...legs, { from: '', to: '', date: '', airline: '' }])}
                className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 font-semibold flex items-center justify-center gap-2 hover:bg-gray-50"
            >
                <Plus size={18} /> Add Another Flight
            </button>
          )}

          <div className="pt-4 flex gap-3">
            <button onClick={saveTrip} disabled={loading} className="flex-1 bg-blue-600 text-white p-4 rounded-xl font-bold shadow-lg shadow-blue-200">
                {loading ? 'Saving...' : 'Save Trip'}
            </button>
            <button onClick={() => setView('list')} className="bg-white border border-gray-200 text-gray-700 p-4 rounded-xl font-bold">
                Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // LIST VIEW
  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-20">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">My Logbook</h1>
        <Link href="/" className="bg-white p-2 rounded-lg text-gray-600 border border-gray-200 text-sm font-semibold">Back</Link>
      </div>

      <button onClick={() => setView('add')} className="w-full bg-blue-600 text-white p-4 rounded-xl mb-8 font-bold shadow-lg shadow-blue-200 flex items-center justify-center gap-2">
        <Plane size={20} /> Log New Trip
      </button>

      <div className="space-y-4">
        {flights.length === 0 ? (
            <div className="text-center text-gray-400 py-10">No flights logged yet.</div>
        ) : (
            flights.map((f) => (
            <div key={f.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-center">
                <div className="flex items-center gap-4">
                <div className="bg-blue-50 p-3 rounded-full text-blue-600">
                    <Plane size={20} />
                </div>
                <div>
                    <div className="font-bold text-gray-900 text-lg">{f.origin} <span className="text-gray-300 mx-1">➝</span> {f.destination}</div>
                    <div className="text-gray-500 text-sm">{new Date(f.date).toLocaleDateString()}</div>
                </div>
                </div>
                <div className="text-right">
                    <div className="text-xs font-semibold bg-gray-100 text-gray-600 px-2 py-1 rounded">{f.airline || 'N/A'}</div>
                </div>
            </div>
            ))
        )}
      </div>
    </div>
  );
}