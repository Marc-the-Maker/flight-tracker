import { NextResponse } from 'next/server';

// Helper to find the ICAO code (e.g. converts "FA" -> "SFR")
async function getIcaoCode(iata: string) {
  try {
    console.log(`[DB] Fetching airline database...`);
    // Using the 'OpenFlights' dataset converted to JSON
    const res = await fetch('https://raw.githubusercontent.com/jpatokal/openflights/master/data/airlines.dat');
    
    // Note: The raw OpenFlights data is CSV, not JSON. 
    // Let's try a different, cleaner JSON source to be safe.
    // Switching to: 'flights-data' repository which is reliable
    const jsonRes = await fetch('https://raw.githubusercontent.com/jbrooksuk/JSON-Airports/main/airlines.json');
    
    if (!jsonRes.ok) {
        console.error(`[DB] Failed to fetch DB: ${jsonRes.status}`);
        return null;
    }
    
    const airlines = await jsonRes.json();
    console.log(`[DB] Database loaded. Entries: ${airlines.length}`);
    
    // DEBUG: Print the first entry to check key names (iata vs IATA)
    if (airlines.length > 0) {
        console.log(`[DB] Sample Entry keys:`, Object.keys(airlines[0]));
    }

    // Search for the code (Handling Case Sensitivity)
    const airline = airlines.find((a: any) => 
        (a.iata === iata || a.IATA === iata) && 
        (a.active === "Y" || a.active === true || !a.active) // Some DBs don't have 'active' column
    );
    
    if (airline) {
        console.log(`[DB] Found Match:`, airline);
        return airline.icao || airline.ICAO;
    } else {
        console.log(`[DB] No airline found for IATA: ${iata}`);
        return null;
    }

  } catch (e) {
    console.error("[DB] Lookup Crash:", e);
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  let ident = searchParams.get('ident')?.toUpperCase();

  console.log(`\n--- NEW REQUEST ---`);
  console.log(`🔍 [API] Received Input: "${ident}"`);

  if (!ident) return NextResponse.json({ error: 'No ident' }, { status: 400 });

  const apiKey = process.env.FLIGHTAWARE_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

  try {
    // --- STEP 1: AUTO-CORRECT IATA TO ICAO ---
    const match = ident.match(/^([A-Z]{2})([0-9]+)$/); 
    
    if (match) {
      const iataCode = match[1]; // "FA"
      const flightNum = match[2]; // "600"
      console.log(`[API] Detected IATA pattern: Code="${iataCode}", Num="${flightNum}"`);
      
      const icaoCode = await getIcaoCode(iataCode);
      
      if (icaoCode) {
        ident = `${icaoCode}${flightNum}`; 
        console.log(`✨ [API] Converted ${iataCode} -> ${icaoCode}. New Ident: ${ident}`);
      } else {
        console.warn(`⚠️ [API] Conversion failed. Keeping original: ${ident}`);
      }
    } else {
        console.log(`[API] Input does not look like IATA (2 letters). Skipping conversion.`);
    }

    // --- STEP 2: CALL FLIGHTAWARE ---
    const url = `https://aeroapi.flightaware.com/aeroapi/flights/${ident}?max_pages=1`;
    console.log(`📡 [API] Calling FlightAware: ${url}`);
    
    const res = await fetch(url, {
      headers: { 'x-apikey': apiKey }
    });

    if (!res.ok) {
        console.error(`❌ [API] FlightAware Error: ${res.status}`);
        return NextResponse.json({ error: 'Provider Error' }, { status: res.status });
    }

    const data = await res.json();
    const flights = data.flights;

    if (!flights || flights.length === 0) {
      console.error(`❌ [API] FlightAware returned 0 flights for ${ident}`);
      return NextResponse.json({ error: 'Flight not found' }, { status: 404 });
    }

    // --- STEP 3: EXTRACT DATA ---
    console.log(`✅ [API] Flight found! Extracting data...`);
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
    
    return NextResponse.json(payload);

  } catch (error) {
    console.error("🔥 [API] Internal Crash:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}