import { NextResponse } from 'next/server';

// Helper to fetch and find the ICAO code
async function getIcaoCode(iata: string) {
  try {
    // We use a free, public list of airline codes
    const res = await fetch('https://raw.githubusercontent.com/nprail/airline-codes/master/airlines.json');
    if (!res.ok) return null;
    
    const airlines = await res.json();
    // Find the airline where "iata" matches our input (e.g., "FA")
    // active: "Y" ensures we don't pick a defunct airline
    const airline = airlines.find((a: any) => a.iata === iata && a.active === "Y");
    
    return airline ? airline.icao : null;
  } catch (e) {
    console.error("Airline DB lookup failed", e);
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  let ident = searchParams.get('ident')?.toUpperCase(); // e.g. "FA600"

  console.log(`🔍 [API] Input: ${ident}`);

  if (!ident) return NextResponse.json({ error: 'No ident' }, { status: 400 });

  const apiKey = process.env.FLIGHTAWARE_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

  try {
    // --- STEP 1: AUTO-CORRECT IATA TO ICAO ---
    // Regex to split "FA" from "600"
    const match = ident.match(/^([A-Z]{2})([0-9]+)$/); 
    
    if (match) {
      const iataCode = match[1]; // "FA"
      const flightNum = match[2]; // "600"
      
      console.log(`⚠️ [API] Detected IATA code: ${iataCode}. Attempting convert...`);
      
      const icaoCode = await getIcaoCode(iataCode); // Returns "SFR"
      
      if (icaoCode) {
        ident = `${icaoCode}${flightNum}`; // Becomes "SFR600"
        console.log(`✨ [API] Converted to ICAO: ${ident}`);
      } else {
        console.log(`❌ [API] Could not find ICAO for ${iataCode}, sticking with original.`);
      }
    }

    // --- STEP 2: CALL FLIGHTAWARE ---
    const url = `https://aeroapi.flightaware.com/aeroapi/flights/${ident}?max_pages=1`;
    
    const res = await fetch(url, {
      headers: { 'x-apikey': apiKey }
    });

    if (!res.ok) {
        console.error(`❌ [API] Provider Error: ${res.status}`);
        return NextResponse.json({ error: 'Provider Error' }, { status: res.status });
    }

    const data = await res.json();
    const flights = data.flights;

    if (!flights || flights.length === 0) {
      console.log(`❌ [API] Still 0 flights found for ${ident}`);
      return NextResponse.json({ error: 'Flight not found' }, { status: 404 });
    }

    // --- STEP 3: EXTRACT DATA ---
    const lastFlight = flights.find((f: any) => f.actual_off) || flights[0];

    const payload = {
      origin: lastFlight.origin.code,
      destination: lastFlight.destination.code,
      duration: lastFlight.filed_ete ? Math.round(lastFlight.filed_ete / 60) : 0,
      actual_duration: (lastFlight.actual_on && lastFlight.actual_off) 
        ? Math.round((new Date(lastFlight.actual_on).getTime() - new Date(lastFlight.actual_off).getTime()) / 60000)
        : null,
      departure_date: lastFlight.scheduled_off.split('T')[0]
    };
    
    console.log("✅ [API] Success:", payload);
    return NextResponse.json(payload);

  } catch (error) {
    console.error("🔥 [API] Crash:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}