import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ident = searchParams.get('ident');

  if (!ident) return NextResponse.json({ error: 'No flight number provided' }, { status: 400 });

  const apiKey = process.env.FLIGHTAWARE_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'API Key missing' }, { status: 500 });

  try {
    // 1. Ask FlightAware for the last 15 flights with this number
    const res = await fetch(`https://aeroapi.flightaware.com/aeroapi/flights/${ident}?max_pages=1`, {
      headers: { 'x-apikey': apiKey }
    });

    if (!res.ok) throw new Error('Failed to fetch from FlightAware');

    const data = await res.json();
    const flights = data.flights;

    if (!flights || flights.length === 0) {
      return NextResponse.json({ error: 'Flight not found' }, { status: 404 });
    }

    // 2. Find the most relevant flight (the one that actually departed)
    // We look for the first flight that has an actual_off (takeoff time)
    const lastFlight = flights.find((f: any) => f.actual_off) || flights[0];

    // 3. Extract the precise data
    const payload = {
      origin: lastFlight.origin.code,
      destination: lastFlight.destination.code,
      // FlightAware gives seconds, we want minutes
      duration: lastFlight.filed_ete ? Math.round(lastFlight.filed_ete / 60) : 0, 
      // If actual_runway_off and on exist, calculate ACTUAL time (more accurate)
      actual_duration: (lastFlight.actual_on && lastFlight.actual_off) 
        ? Math.round((new Date(lastFlight.actual_on).getTime() - new Date(lastFlight.actual_off).getTime()) / 60000)
        : null,
      departure_date: lastFlight.scheduled_off.split('T')[0]
    };

    return NextResponse.json(payload);

  } catch (error) {
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }
}