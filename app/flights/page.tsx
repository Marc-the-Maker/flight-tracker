'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, ArrowLeft, Trash2, Loader2, Plane, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';

// --- MATH HELPERS ---
function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * (Math.PI/180)) * Math.cos(lat2 * (Math.PI/180)) * Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return Math.round(R * c);
}

type Leg = {
  from: any;
  to: any;
  date: string;
  flightNumber: string;
  airline: string;
  distance: number | ''; 
  duration: number | ''; 
  showManual: boolean; 
  error?: string;
};

export default function FlightsPage() {
  const [view, setView] = useState<'list' | 'add'>('list');
  const [flights, setFlights] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  
  const [airportList, setAirportList] = useState<any[]>([]);
  const [airlineList, setAirlineList] = useState<any[]>([]); 

  const [tripType, setTripType] = useState<'one-way' | 'return' | 'multi'>('return');
  const [legs, setLegs] = useState<Leg[]>([
    { from: null, to: null, date: new Date().toISOString().split('T')[0], flightNumber: '', airline: '', distance: '', duration: '', showManual: false },
    { from: null, to: null, date: new Date().toISOString().split('T')[0], flightNumber: '', airline: '', distance: '', duration: '', showManual: false }
  ]);

  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [activeSearch, setActiveSearch] = useState<{ i: number, f: 'from' | 'to' } | null>(null);

  useEffect(() => {
    fetchHistory();
    
    // 1. Fetch Airports
    fetch('https://raw.githubusercontent.com/mwgg/Airports/master/airports.json')
      .then(res => res.ok ? res.json() : [])
      .then(data => setAirportList(Object.values(data)))
      .catch(e => console.error("Airport load failed", e));
    
    // 2. Fetch Airlines (NEW WORKING URL)
    console.log("Fetching airline database...");
    fetch('https://raw.githubusercontent.com/flyinactor91/airline-codes/master/airlines.json')
      .then(res => res.ok ? res.json() : [])
      .then(data => {
          console.log(`Airline DB loaded: ${data.length} entries`);
          setAirlineList(data);
      })
      .catch(e => console.error("Airline load failed", e));
  }, []);

  const fetchHistory = async () => {
    const { data } = await supabase.from('flights').select('*').order('date', { ascending: false });
    if (data) setFlights(data);
  };

  const getAirlineLogoUrl = (flightCode: string) => {
    if (!flightCode || flightCode.length < 3) return null;
    
    const match = flightCode.match(/^([A-Z]+)/);
    if (!match) return null;
    const code = match[1]; // e.g., "SFR" or "FA"

    // 1. HARDCODED FALLBACKS (Ensure these always have logos)
    const manualMap: Record<string, string> = {
        'SFR': 'FA', // FlySafair
        'FA': 'FA',
        'SAA': 'SA', // South African Airways
        'SA': 'SA',
        'LNK': '4Z', // Airlink
        '4Z': '4Z',
        'BAW': 'BA', // British Airways
        'BA': 'BA'
    };
    
    if (manualMap[code]) {
        return `https://pics.avs.io/200/200/${manualMap[code]}.png`;
    }

    // 2. Database Lookup
    if (airlineList.length > 0) {
        const airline = airlineList.find((a: any) => a.icao === code || a.iata === code);
        if (airline && airline.iata && airline.iata !== '-' && airline.iata.length === 2) {
            return `https://pics.avs.io/200/200/${airline.iata}.png`;
        }
    }
    return null;
  };

  // --- STANDARD HANDLERS ---
  const handleSearch = (i: number, f: 'from' | 'to', query: string) => {
    setActiveSearch({ i, f });
    if (query.length > 1) {
      const res = airportList.filter((a: any) => 
        (a.iata?.toLowerCase().includes(query.toLowerCase()) || a.city?.toLowerCase().includes(query.toLowerCase())) && a.iata
      ).slice(0, 5);
      setSuggestions(res);
    } else {
      setSuggestions([]);
    }
  };

  const selectAirport = (airport: any) => {
    if (!activeSearch) return;
    const { i, f } = activeSearch;
    const newLegs = [...legs];
    newLegs[i][f] = airport;
    if (newLegs[i].from && newLegs[i].to && !newLegs[i].distance) {
        const dist = getDistanceKm(newLegs[i].from.lat, newLegs[i].from.lon, newLegs[i].to.lat, newLegs[i].to.lon);
        newLegs[i].distance = dist;
    }
    setLegs(newLegs);
    setActiveSearch(null);
  };

  const saveTrip = async () => {
    setLoading(true);
    setLoadingMessage('Checking Flight Network...');
    
    const newLegs = [...legs];
    const payload = [];
    let hasError = false;

    for (let i = 0; i < newLegs.length; i++) {
        const leg = newLegs[i];
        if (!leg.flightNumber && !leg.from) continue;

        let finalDuration = Number(leg.duration);
        let finalDistance = Number(leg.distance);
        let originObj = leg.from;
        let destObj = leg.to;

        if (leg.flightNumber && leg.flightNumber.length > 2) {
            setLoadingMessage(`Looking up ${leg.flightNumber}...`);
            try {
                const res = await fetch(`/api/flight_lookup?ident=${leg.flightNumber}`);
                const apiData = await res.json();
                if (!apiData.error) {
                    if (apiData.duration) finalDuration = apiData.duration;
                    if (!originObj) originObj = airportList.find((a: any) => a.icao === apiData.origin || a.iata === apiData.origin);
                    if (!destObj) destObj = airportList.find((a: any) => a.icao === apiData.destination || a.iata === apiData.destination);
                    leg.error = undefined;
                } else {
                   if (!originObj || !destObj) { leg.error = "Flight not found. Enter manual details."; leg.showManual = true; hasError = true; }
                }
            } catch (err) {
                if (!originObj || !destObj) { leg.error = "Network error. Enter manually."; leg.showManual = true; hasError = true; }
            }
        } else {
            if (!originObj || !destObj) { leg.error = "Missing info"; hasError = true; }
        }

        if (!finalDistance && originObj && destObj) {
             finalDistance = getDistanceKm(originObj.lat, originObj.lon, destObj.lat, destObj.lon);
             if (!finalDuration) finalDuration = Math.round((finalDistance / 800 * 60) + 30);
        }

        if (!hasError) {
            payload.push({
                date: leg.date,
                origin: originObj?.iata || 'UNK',
                destination: destObj?.iata || 'UNK',
                airline: leg.airline || null,
                flight_number: leg.flightNumber || null,
                distance_km: finalDistance || 0,
                duration_min: finalDuration || 0
            });
        }
    }

    setLegs(newLegs);
    if (hasError) { setLoading(false); return; }

    setLoadingMessage('Saving...');
    const { error } = await supabase.from('flights').insert(payload);
    if (error) alert("Database Error: " + error.message);
    else {
        setView('list');
        fetchHistory();
        setLegs([{ from: null, to: null, date: new Date().toISOString().split('T')[0], flightNumber: '', airline: '', distance: '', duration: '', showManual: false }]);
    }
    setLoading(false);
  };

  if (view === 'add') {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <h2 className="text-2xl font-bold mb-6 text-gray-900">Add Trip</h2>
        <div className="flex bg-gray-200 p-1 rounded-lg mb-6">
          {(['one-way', 'return', 'multi'] as const).map(t => (
             <button key={t} onClick={() => { setTripType(t); if(t === 'one-way') setLegs([legs[0]]); else if(t === 'return') setLegs([legs[0], { ...legs[0], flightNumber: '', error: undefined }]); }} className={`flex-1 py-2 text-sm font-bold capitalize rounded-md ${tripType === t ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>{t}</button>
          ))}
        </div>
        <div className="space-y-4">
          {legs.map((leg, i) => (
            <div key={i} className={`bg-white p-5 rounded-xl shadow-sm border transition-all ${leg.error ? 'border-red-500 ring-1 ring-red-200' : 'border-gray-100'}`}>
              <div className="flex justify-between items-center mb-4"><div className="text-xs font-bold text-gray-400 uppercase tracking-wider">Flight {i+1}</div>{leg.error && <div className="text-xs text-red-500 flex items-center gap-1"><AlertCircle size={12}/> {leg.error}</div>}</div>
              <div className="grid grid-cols-2 gap-4 mb-2">
                  <div><label className="text-[10px] text-gray-400 font-bold uppercase">Flight No.</label><input placeholder="SA302" value={leg.flightNumber} onChange={e => {const n=[...legs]; n[i].flightNumber=e.target.value.toUpperCase(); n[i].error=undefined; setLegs(n)}} className="w-full p-3 bg-gray-50 rounded-lg border border-gray-200 text-lg font-bold uppercase text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"/></div>
                  <div><label className="text-[10px] text-gray-400 font-bold uppercase">Date</label><input type="date" value={leg.date} onChange={e => {const n=[...legs]; n[i].date=e.target.value; setLegs(n)}} className="w-full p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm font-semibold text-gray-900" /></div>
              </div>
              <button onClick={() => {const n=[...legs]; n[i].showManual = !n[i].showManual; setLegs(n)}} className="text-xs text-blue-500 font-semibold flex items-center gap-1 mt-2 mb-2">{leg.showManual ? <ChevronUp size={14}/> : <ChevronDown size={14}/>} {leg.showManual ? 'Hide Details' : 'Manual Entry / Details'}</button>
              {leg.showManual && (
                  <div className="mt-3 pt-3 border-t border-gray-100 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="relative"><label className="text-[10px] text-gray-400 font-bold uppercase">From</label><input className="w-full p-2 bg-gray-50 rounded border border-gray-200 font-bold text-gray-900 uppercase" placeholder="CPT" value={activeSearch?.i === i && activeSearch.f === 'from' ? undefined : (leg.from ? leg.from.iata : '')} onChange={(e) => handleSearch(i, 'from', e.target.value)} onFocus={(e) => handleSearch(i, 'from', e.target.value)}/>{activeSearch?.i === i && activeSearch.f === 'from' && suggestions.length > 0 && (<div className="absolute z-10 top-full w-full bg-white shadow-xl max-h-40 overflow-auto border rounded-b-lg">{suggestions.map(s => <div key={s.iata} onClick={() => selectAirport(s)} className="p-2 hover:bg-gray-50 border-b text-sm font-bold">{s.iata}</div>)}</div>)}</div>
                        <div className="relative"><label className="text-[10px] text-gray-400 font-bold uppercase">To</label><input className="w-full p-2 bg-gray-50 rounded border border-gray-200 font-bold text-gray-900 uppercase" placeholder="JNB" value={activeSearch?.i === i && activeSearch.f === 'to' ? undefined : (leg.to ? leg.to.iata : '')} onChange={(e) => handleSearch(i, 'to', e.target.value)} onFocus={(e) => handleSearch(i, 'to', e.target.value)}/>{activeSearch?.i === i && activeSearch.f === 'to' && suggestions.length > 0 && (<div className="absolute z-10 top-full w-full bg-white shadow-xl max-h-40 overflow-auto border rounded-b-lg">{suggestions.map(s => <div key={s.iata} onClick={() => selectAirport(s)} className="p-2 hover:bg-gray-50 border-b text-sm font-bold">{s.iata}</div>)}</div>)}</div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="relative"><input type="number" placeholder="Dist" value={leg.distance} onChange={e => {const n=[...legs]; n[i].distance=Number(e.target.value); setLegs(n)}} className="w-full p-2 bg-gray-50 rounded border border-gray-200 text-sm" /><span className="absolute right-2 top-2 text-xs text-gray-400">km</span></div>
                        <div className="relative"><input type="number" placeholder="Time" value={leg.duration} onChange={e => {const n=[...legs]; n[i].duration=Number(e.target.value); setLegs(n)}} className="w-full p-2 bg-gray-50 rounded border border-gray-200 text-sm" /><span className="absolute right-2 top-2 text-xs text-gray-400">min</span></div>
                      </div>
                  </div>
              )}
              {tripType === 'multi' && i > 0 && <button onClick={() => setLegs(legs.filter((_, idx) => idx !== i))} className="absolute top-4 right-4 text-red-400"><Trash2 size={16}/></button>}
            </div>
          ))}
          {tripType === 'multi' && <button onClick={() => setLegs([...legs, { ...legs[legs.length-1], from: legs[legs.length-1]?.to, to: null, distance: '', duration: '', flightNumber: '', airline: '', showManual: false }])} className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 font-bold text-sm">+ Add Leg</button>}
          <div className="flex gap-3 pt-4"><button onClick={saveTrip} disabled={loading} className="flex-1 bg-blue-600 text-white p-4 rounded-xl font-bold shadow-lg shadow-blue-200 flex items-center justify-center gap-2">{loading && <Loader2 className="animate-spin" size={20}/>} {loading ? loadingMessage : 'Save Trip'}</button><button onClick={() => setView('list')} className="bg-white border border-gray-200 text-gray-700 p-4 rounded-xl font-bold">Cancel</button></div>
        </div>
      </div>
    );
  }

  // --- LIST VIEW ---
  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-20">
       <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Logbook</h1>
          <Link href="/" className="bg-white p-2 rounded-lg border border-gray-200 text-gray-600"><ArrowLeft size={20}/></Link>
       </div>
       <button onClick={() => setView('add')} className="w-full bg-blue-600 text-white p-4 rounded-xl mb-6 font-bold shadow-lg shadow-blue-200 flex items-center justify-center gap-2"><Plus size={20}/> Log New Trip</button>
       <div className="space-y-4">
          {flights.map(f => {
             const originObj = airportList.find(a => a.iata === f.origin);
             const destObj = airportList.find(a => a.iata === f.destination);
             const originName = originObj ? originObj.city : f.origin;
             const destName = destObj ? destObj.city : f.destination;
             
             // LOGO LOGIC
             const logoUrl = getAirlineLogoUrl(f.flight_number);

             return (
                 <div key={f.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                       <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center overflow-hidden flex-shrink-0">
                           {logoUrl ? (
                               <img 
                                 src={logoUrl} 
                                 alt="Logo" 
                                 className="w-full h-full object-contain p-1"
                                 onError={(e) => {
                                     e.currentTarget.style.display = 'none';
                                     e.currentTarget.parentElement?.classList.add('fallback-icon');
                                 }}
                               />
                           ) : (
                               <Plane size={20} className="text-blue-600"/>
                           )}
                           <Plane size={20} className="text-blue-600 hidden fallback-plane"/>
                       </div>
                       <div>
                          <div className="text-lg font-bold text-gray-900 leading-tight">{originName} <span className="text-gray-300">➝</span> {destName}</div>
                          <div className="text-xs text-gray-500 flex gap-2 mt-1"><span>{new Date(f.date).toLocaleDateString()}</span><span className="font-bold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">{f.flight_number}</span></div>
                       </div>
                    </div>
                    <div className="text-right">
                       <div className="text-sm font-bold text-gray-900">{f.distance_km}km</div>
                       <div className="text-xs text-gray-400">{Math.floor(f.duration_min/60)}h {f.duration_min%60}m</div>
                    </div>
                 </div>
             );
          })}
       </div>
       <style jsx>{` .fallback-icon img { display: none; } .fallback-icon .fallback-plane { display: block; } `}</style>
    </div>
  );
}