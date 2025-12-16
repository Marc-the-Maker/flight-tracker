import { NextResponse } from 'next/server';

// Helper to find the ICAO code (e.g. converts "FA" -> "SFR")
async function getIcaoCode(iata: string) {
  // 1. HARDCODED FALLBACKS (Instant fix for common local airlines)
  const commonAirlines: Record<string, string> = {
    'FA': 'SFR', // FlySafair
    'mn': 'CAW', // Comair (Kulula - historic)
    '4Z': 'LNK', // Airlink
    'Z': 'LNK',  // Airlink (alternative)
    'JE': 'KUL', // Kulula
    'BA': 'BAW', // British Airways
    'SA': 'SAA', // SAA
  };

  if (commonAirlines[iata]) {
    console.log(`[DB] Used hardcoded fallback for ${iata} -> ${commonAirlines[iata]}`);
    return commonAirlines[iata];
  }

  // 2. REMOTE DATABASE LOOKUP (For everything else)
  try {
    console.log(`[DB] Fetching airline database...`);
    // NEW WORKING URL
    const res = await fetch('https://raw.githubusercontent.com/flyinactor91/airline-codes/master/airlines.json');
    
    if (!res.ok) {
        console.error(`[DB] Failed to fetch DB: ${res.status}`);
        return null;
    }
    
    const airlines = await res.json();
    
    // Search for the code
    const airline = airlines.find((a: any) => a.iata === iata && a.active === "Y");
    
    return airline ? airline.icao : null;
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
      
      const icaoCode = await getIcaoCode(iataCode);
      
      if (icaoCode) {
        ident = `${icaoCode}${flightNum}`; 
        console.log(`✨ [API] Converted ${iataCode} -> ${icaoCode}. New Ident: ${ident}`);
      }
    }

    // --- STEP 2: CALL FLIGHTAWARE ---
    const url = `https://aeroapi.flightaware.com/aeroapi/flights/${ident}?max_pages=1`;
    console.log(`📡 [API] Calling FlightAware: ${url}`);
    
    const res = await fetch(url, {
      headers: { 'x-apikey': apiKey }
    });

    if (!res.ok) {
        return NextResponse.json({ error: 'Provider Error' }, { status: res.status });
    }

    const data = await res.json();
    const flights = data.flights;

    if (!flights || flights.length === 0) {
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
    
    return NextResponse.json(payload);

  } catch (error) {
    console.error("🔥 [API] Crash:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}