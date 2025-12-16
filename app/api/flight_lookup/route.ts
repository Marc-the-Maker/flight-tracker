import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ident = searchParams.get('ident');

  console.log(`🔍 [API] Searching for flight: ${ident}`); // LOG 1

  if (!ident) return NextResponse.json({ error: 'No ident' }, { status: 400 });

  const apiKey = process.env.FLIGHTAWARE_API_KEY;
  if (!apiKey) {
    console.error("❌ [API] API Key is MISSING in environment variables!"); // LOG 2
    return NextResponse.json({ error: 'Server config error' }, { status: 500 });
  }

  try {
    const url = `https://aeroapi.flightaware.com/aeroapi/flights/${ident}?max_pages=1`;
    console.log(`📡 [API] Fetching: ${url}`); // LOG 3

    const res = await fetch(url, {
      headers: { 'x-apikey': apiKey }
    });

    console.log(`STATUS: ${res.status}`); // LOG 4

    if (!res.ok) {
        const errText = await res.text();
        console.error(`❌ [API] Error from FlightAware: ${errText}`); // LOG 5
        return NextResponse.json({ error: 'Provider Error' }, { status: res.status });
    }

    const data = await res.json();
    console.log(`✅ [API] Flights found: ${data.flights?.length || 0}`); // LOG 6

    const flights = data.flights;

    if (!flights || flights.length === 0) {
      return NextResponse.json({ error: 'Flight not found' }, { status: 404 });
    }

    // Logic to find the correct flight leg
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
    
    console.log("📦 [API] Sending payload:", payload);
    return NextResponse.json(payload);

  } catch (error) {
    console.error("🔥 [API] Crash:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}