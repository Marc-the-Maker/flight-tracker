'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, ArrowLeft, Trash2, Loader2, Plane, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';

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
  from: any; to: any; date: string; flightNumber: string; airline: string; distance: number | ''; duration: number | ''; showManual: boolean; error?: string;
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
    fetch('https://raw.githubusercontent.com/mwgg/Airports/master/airports.json').then(res => res.ok ? res.json() : []).then(data => setAirportList(Object.values(data)));
    fetch('https://raw.githubusercontent.com/flyinactor91/airline-codes/master/airlines.json').then(res => res.ok ? res.json() : []).then(data => setAirlineList(data));
  }, []);

  const fetchHistory = async () => {
    const { data } = await supabase.from('flights').select('*').order('date', { ascending: false });
    if (data) setFlights(data);
  };

  const getAirlineLogoUrl = (flightCode: string) => {
    if (!flightCode || flightCode.length < 3) return null;
    const match = flightCode.match(/^([A-Z]+)/);
    if (!match) return null;
    const code = match[1];
    const manualMap: Record<string, string> = { 'SFR': 'FA', 'FA': 'FA', 'SAA': 'SA', 'SA': 'SA', 'LNK': '4Z', '4Z': '4Z', 'BAW': 'BA', 'BA': 'BA' };
    if (manualMap[code]) return `https://pics.avs.io/200/200/${manualMap[code]}.png`;
    if (airlineList.length > 0) {
        const airline = airlineList.find((a: any) => a.icao === code || a.iata === code);
        if (airline && airline.iata && airline.iata !== '-' && airline.iata.length === 2) return `https://pics.avs.io/200/200/${airline.iata}.png`;
    }
    return null;
  };

  const handleSearch = (i: number, f: 'from' | 'to', query: string) => {
    setActiveSearch({ i, f });
    if (query.length > 1) {
      const res = airportList.filter((a: any) => (a.iata?.toLowerCase().includes(query.toLowerCase()) || a.city?.toLowerCase().includes(query.toLowerCase())) && a.iata).slice(0, 5);
      setSuggestions(res);
    } else { setSuggestions([]); }
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
            } catch (err) { if (!originObj || !destObj) { leg.error = "Network error. Enter manually."; leg.showManual = true; hasError = true; } }
        } else { if (!originObj || !destObj) { leg.error = "Missing info"; hasError = true; } }

        if (!finalDistance && originObj && destObj) {
             finalDistance = getDistanceKm(originObj.lat, originObj.lon, destObj.lat, destObj.lon);
             if (!finalDuration) finalDuration = Math.round((finalDistance / 800 * 60) + 30);
        }
        if (!hasError) {
            payload.push({ date: leg.date, origin: originObj?.iata || 'UNK', destination: destObj?.iata || 'UNK', airline: leg.airline || null, flight_number: leg.flightNumber || null, distance_km: finalDistance || 0, duration_min: finalDuration || 0 });
        }
    }
    setLegs(newLegs);
    if (hasError) { setLoading(false); return; }
    setLoadingMessage('Saving...');
    const { error } = await supabase.from('flights').insert(payload);
    if (error) alert("Database Error: " + error.message);
    else { setView('list'); fetchHistory(); setLegs([{ from: null, to: null, date: new Date().toISOString().split('T')[0], flightNumber: '', airline: '', distance: '', duration: '', showManual: false }]); }
    setLoading(false);
  };

  if (view === 'add') {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <h2 className="text-2xl font-black mb-6 text-gray-900 uppercase tracking-tight">Add Trip</h2>
        <div className="flex bg-gray-200 p-1 rounded-lg mb-6">
          {(['one-way', 'return', 'multi'] as const).map(t => (
             <button key={t} onClick={() => { setTripType(t); if(t === 'one-way') setLegs([legs[0]]); else if(t === 'return') setLegs([legs[0], { ...legs[0], flightNumber: '', error: undefined }]); }} className={`flex-1 py-2 text-sm font-bold capitalize rounded-md transition-colors ${tripType === t ? 'bg-white shadow text-[#FF2800]' : 'text-gray-500 hover:text-gray-700'}`}>{t.replace('-', ' ')}</button>
          ))}
        </div>
        <div className="space-y-4">
          {legs.map((leg, i) => (
            <div key={i} className={`bg-white p-5 rounded-xl shadow-sm border transition-all ${leg.error ? 'border-red-500 ring-1 ring-red-200' : 'border-gray-100'}`}>
              <div className="flex justify-between items-center mb-4"><div className="text-xs font-bold text-gray-400 uppercase tracking-wider">Flight {i+1}</div>{leg.error && <div className="text-xs text-red-500 flex items-center gap-1"><AlertCircle size={12}/> {leg.error}</div>}</div>
              <div className="grid grid-cols-2 gap-4 mb-2">
                  <div><label className="text-[10px] text-gray-400 font-bold uppercase">Flight No.</label><input placeholder="SA302" value={leg.flightNumber} onChange={e => {const n=[...legs]; n[i].flightNumber=e.target.value.toUpperCase(); n[i].error=undefined; setLegs(n)}} className="w-full p-3 bg-gray-50 rounded-lg border border-gray-200 text-lg font-bold uppercase text-gray-900 focus:ring-2 focus:ring-[#FF2800] outline-none caret-[#FF2800]"/></div>
                  <div><label className="text-[10px] text-gray-400 font-bold uppercase">Date</label><input type="date" value={leg.date} onChange={e => {const n=[...legs]; n[i].date=e.target.value; setLegs(n)}} className="w-full p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm font-semibold text-gray-900 focus:ring-2 focus:ring-[#FF2800] outline-none" /></div>
              </div>
              <button onClick={() => {const n=[...legs]; n[i].showManual = !n[i].showManual; setLegs(n)}} className="text-