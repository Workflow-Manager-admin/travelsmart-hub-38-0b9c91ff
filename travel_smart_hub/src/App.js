import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import './App.css';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// Context to share itinerary/route between planner and map
const UserRouteContext = createContext();

// Mapbox tile support: configure from .env if present
const MAPBOX_KEY = process.env.REACT_APP_MAPBOX_KEY || '';
const MAPBOX_STYLE = 'light-v11'; // or other Mapbox styles
const MAPBOX_DEFAULT_URL =
  `https://api.mapbox.com/styles/v1/mapbox/${MAPBOX_STYLE}/tiles/{z}/{x}/{y}?access_token=${MAPBOX_KEY}`;

// Helper for Mapbox error
function MapboxErrorBanner({ error }) {
  if (!error) return null;
  return (
    <div style={{
      color: '#fff',
      background: '#e57373', border: '2px solid #f8b14f', borderRadius: 10,
      padding: 12, margin: '10px 0', textAlign: 'center', fontWeight: 600
    }}>
      Map Error: {error}
    </div>
  );
}

console.log('process.env', process.env);

function Navbar({ currentPage, onNavigate }) {
  const navLinks = [
    { key: 'home', label: 'Home' },
    { key: 'planner', label: 'Planner' },
    { key: 'map', label: 'Map' },
    { key: 'weather', label: 'Weather' },
    { key: 'ai', label: 'AI Suggestions' }
  ];
  return (
    <nav className="navbar" style={{background: 'var(--base-dark)'}}>
      <div className="container" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%'}}>
        <div className="logo">
          <span className="logo-symbol" style={{color: '#f8b14f'}}>✈</span> TravelSmart Planner
        </div>
        <div style={{display: 'flex', gap: '8px'}}>
          {navLinks.map(({ key, label }) => (
            <button
              key={key}
              className="btn"
              style={{
                background: currentPage === key ? '#f8b14f' : '#b3eca7',
                color: currentPage === key ? '#fff' : '#222',
                borderBottom: currentPage === key ? '2px solid #cb7cb6' : 'none'
              }}
              onClick={() => onNavigate(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}

function HomePage({ onNavigate }) {
  return (
    <div className="hero" style={{ paddingTop: 120, minHeight: 400 }}>
      <div className="subtitle" style={{color: '#b3eca7', marginBottom: 6, fontWeight: 500}}>Plan Effortlessly</div>
      <h1 className="title" style={{color: '#f8b14f'}}>TravelSmart Planner</h1>
      <div className="description">
        Streamline your trip planning with personalized itineraries, interactive maps, live weather, and smart AI-powered travel tips!
      </div>
      <div style={{display: 'flex', gap: 12, marginTop: 18, flexWrap: 'wrap', justifyContent: 'center'}}>
        <button className="btn btn-large" style={{background: '#cb7cb6', color:'#fff'}} onClick={() => onNavigate('planner')}>Start Planning</button>
        <button className="btn btn-large" style={{background: '#b3eca7', color:'#223', fontWeight: 600}} onClick={() => onNavigate('map')}>Explore Map</button>
        <button className="btn btn-large" style={{background: '#f8b14f', color:'#fff'}} onClick={() => onNavigate('ai')}>Ask AI</button>
      </div>
    </div>
  );
}

/**
 * PlannerPage: Enhanced trip planner UI and itinerary generator for travel details and attractions.
 */
// PUBLIC_INTERFACE
function PlannerPage({ onSetRoute }) {
  // Form states
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [placesInput, setPlacesInput] = useState("");
  const [places, setPlaces] = useState([]);
  const [itinerary, setItinerary] = useState(null);
  const [error, setError] = useState("");
  const placeInputRef = useRef();

  // Handle dynamic places to visit
  function addPlace() {
    const trimmed = placesInput.trim();
    if (trimmed && !places.includes(trimmed)) {
      setPlaces([...places, trimmed]);
      setPlacesInput('');
      placeInputRef.current && placeInputRef.current.focus();
    }
  }
  function removePlace(idx) {
    setPlaces(places.filter((_, i) => i !== idx));
  }

  // Helper: get array of dates between start and end (inclusive)
  function getTravelDays(start, end) {
    const result = [];
    let cur = new Date(start);
    const last = new Date(end);
    while (cur <= last) {
      result.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return result;
  }

  // Helper: simple (mock) greedy route ordering
  function optimizeOrder(start, placesArr, end) {
    // If no routing API, just use the input order. For demo, nearest-neighbor by 'cityCoords' distance if possible.
    if (!window.L) return [start, ...placesArr, end].filter(Boolean); // fallback plain sequence

    // Cities to use in sequence
    let sequence = [start].concat(placesArr);
    // Try to arrange placesArr by greedy closest to previous, using cityCoords (mock)
    let visited = [], cities = [...placesArr];
    let current = start;
    while (cities.length > 0) {
      let currCoord = getCoords(current);
      let nearestIdx = 0;
      let minDist = 1e12;
      for (let i = 0; i < cities.length; ++i) {
        let cc = getCoords(cities[i]);
        let dist = Math.sqrt(Math.pow(cc[0] - currCoord[0], 2) + Math.pow(cc[1] - currCoord[1], 2));
        if (dist < minDist) {
          minDist = dist;
          nearestIdx = i;
        }
      }
      visited.push(cities[nearestIdx]);
      current = cities[nearestIdx];
      cities.splice(nearestIdx, 1);
    }
    let routeSeq = [start].filter(Boolean).concat(visited).concat([end].filter(Boolean));
    return routeSeq;
  }

  // Form submission handler (construct + schedule itinerary)
  function onSubmit(e) {
    e.preventDefault();
    setError('');
    if (!from || !to || !startDate || !endDate || !places.length) {
      setError("Please fill from, to, dates, and add at least one place.");
      setItinerary(null);
      return;
    }
    if (new Date(endDate) < new Date(startDate)) {
      setError("End date must not be before start date.");
      setItinerary(null);
      return;
    }
    // Do not mutate places, calculate route/sequence
    const seq = optimizeOrder(from, places, to);

    // Distribute places over days, even allocation/greedy for demo (1 attraction per day)
    const daysArr = getTravelDays(startDate, endDate);
    // First day = from address, last day = to address, attractions fill the gap, one per day
    // If more attractions than days, assign multiple per day (as reasonably balanced as possible)

    // Assign attractions to each day (excluding from/to on endpoints)
    const nAttractDays = Math.max(1, daysArr.length - 2); // days for attractions, not endpoints
    let scheduled = [];
    let attractions = seq.slice(1, seq.length - 1); // ignore from/to for schedule rendering
    // If only 1 day total, cram everything in that day
    if (daysArr.length === 1) {
      scheduled.push({
        date: daysArr[0].toISOString().slice(0, 10),
        places: [from, ...attractions, to].filter(Boolean),
      });
    } else {
      // From day
      scheduled.push({ date: daysArr[0].toISOString().slice(0, 10), places: [from] });
      // Middle days fill attractions, spreading as evenly as possible
      let attIdx = 0;
      for (let d = 1; d < daysArr.length-1; ++d) {
        let perDay = Math.ceil(attractions.length / nAttractDays);
        if (d > nAttractDays) perDay = 0;
        let todaysPlaces = attractions.slice(attIdx, attIdx+perDay);
        if (todaysPlaces.length)
          scheduled.push({ date: daysArr[d].toISOString().slice(0, 10), places: todaysPlaces });
        attIdx += perDay;
      }
      // Last day = to address
      scheduled.push({ date: daysArr[daysArr.length-1].toISOString().slice(0, 10), places: [to] });
    }

    setItinerary({
      sequence: seq,
      days: scheduled,
    });

    // Tell parent for context (used by map/AI, etc)
    onSetRoute(seq.filter(Boolean));
  }

  return (
    <div style={{
      background: 'rgba(255,255,255,0.06)',
      padding: 24, borderRadius: 12, maxWidth: 580, margin: '0 auto', boxShadow: '0 2px 16px #0001'
    }}>
      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* From/To */}
        <div style={{display:"flex", gap:10, flexWrap:"wrap"}}>
          <div style={{flex:1, minWidth:180}}>
            <label style={{fontWeight:500, color:"#cb7cb6"}}>From (starting address or city):</label>
            <input
              value={from}
              onChange={e=>setFrom(e.target.value)}
              required
              style={{padding:8, borderRadius:6, border:"1px solid #b3eca7", width:"100%"}}
              placeholder="e.g. New York"
              autoFocus
            />
          </div>
          <div style={{flex:1, minWidth:180}}>
            <label style={{fontWeight:500, color:"#cb7cb6"}}>To (destination address or city):</label>
            <input
              value={to}
              onChange={e=>setTo(e.target.value)}
              required
              style={{padding:8, borderRadius:6, border:"1px solid #b3eca7", width:"100%"}}
              placeholder="e.g. Paris"
            />
          </div>
        </div>
        {/* Travel dates */}
        <div style={{display:"flex", gap:10, flexWrap:"wrap"}}>
          <div>
            <label style={{fontWeight:500, color:"#b3eca7"}}>Start Date:</label>
            <input
              type="date"
              value={startDate}
              onChange={e=>setStartDate(e.target.value)}
              required
              style={{padding:6, borderRadius:6, border:"1px solid #b3eca7"}}
            />
          </div>
          <div>
            <label style={{fontWeight:500, color:"#b3eca7"}}>End Date:</label>
            <input
              type="date"
              value={endDate}
              onChange={e=>setEndDate(e.target.value)}
              required
              style={{padding:6, borderRadius:6, border:"1px solid #b3eca7"}}
            />
          </div>
        </div>
        {/* Places to visit */}
        <div>
          <label style={{fontWeight:500, color:"#f8b14f"}}>Places to visit (one per line):</label>
          <div style={{display:'flex', gap:10, marginTop:4}}>
            <input
              type="text"
              ref={placeInputRef}
              value={placesInput}
              onChange={e=>setPlacesInput(e.target.value)}
              onKeyDown={e=>{
                if (e.key === 'Enter') { e.preventDefault(); addPlace(); }
              }}
              style={{flex:1, padding:8, borderRadius:6, border:"1px solid #cbcbcb"}}
              placeholder="Add an attraction or city"
            />
            <button type="button" className="btn" style={{background: '#b3eca7', color:'#222'}} onClick={addPlace}>
              Add
            </button>
          </div>
          <ul style={{ listStyle: "none", padding: 0, margin: "6px 0" }}>
            {places.map((place, idx) => (
              <li key={place} style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
                <span style={{ flex: 1, color:'#cb7cb6' }}>{place}</span>
                <button
                  type="button"
                  className="btn"
                  style={{ background: "#f8b14f", marginLeft: 8, color: "#fff", padding: "3px 11px" }}
                  onClick={() => removePlace(idx)}>Remove</button>
              </li>
            ))}
          </ul>
        </div>
        {/* Error display */}
        {error && <div style={{color:'#e57373',margin:'8px 0'}}>{error}</div>}
        <button type="submit" className="btn btn-large" style={{ background: "#cb7cb6", color:'#fff', marginTop:6 }}>Generate Itinerary</button>
      </form>
      {/* Results */}
      {itinerary && (
        <div style={{marginTop:22}}>
          <h3 style={{marginBottom:8, color:'#b3eca7'}}>Your Optimized Itinerary</h3>
          <div>
            <b>Route order:</b>
            <span style={{marginLeft:10, color:'#f8b14f'}}>{itinerary.sequence.join(' › ')}</span>
          </div>
          <ul style={{ marginTop: 12, paddingLeft:20 }}>
            {itinerary.days.map((d, i) => (
              <li key={d.date} style={{
                marginBottom:10, background: 'rgba(200,200,255,0.06)', boxShadow: '0 0 7px #b3eca733', borderRadius:9, padding: '7px 13px'
              }}>
                <b>{d.date}</b>
                <ul style={{margin:"3px 0 0 10px"}}>
                  {d.places.map((p, idx) => (
                    <li key={p+idx} style={{color:'#cb7cb6'}}>{p}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Simple mock: resolves a coordinate for each city (replace with geocode API for real apps)
const cityCoords = {
  "New York": [40.7128, -74.0060],
  "Paris": [48.8566, 2.3522],
  "London": [51.5074, -0.1278],
  "Tokyo": [35.6895, 139.6917],
  "Sydney": [-33.8688, 151.2093],
  "Rome": [41.9028, 12.4964],
  "San Francisco": [37.7749, -122.4194],
  "Singapore": [1.3521, 103.8198],
  "Barcelona": [41.3851, 2.1734],
  "Berlin": [52.52, 13.405],
  "Cairo": [30.0444, 31.2357],
  "Rio de Janeiro": [-22.9068, -43.1729],
};
// fallback generates random "global" locations for demo
function getCoords(city) {
  if(cityCoords[city]) return cityCoords[city];
  return [Math.random()*140-70, Math.random()*360-180];
}

// PUBLIC_INTERFACE
function TravelMap() {
  const { route } = useContext(UserRouteContext);
  const [mapboxError, setMapboxError] = useState('');
  // Center to user's first route or default to Europe
  const center = route && route.length > 0 ? getCoords(route[0]) : [48.85, 2.35];

  return (
    <div style={{ position: 'relative', height: 420, marginTop: 18, borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 16px #00000022' }}>
      <MapboxErrorBanner error={mapboxError} />
      <MapContainer center={center} zoom={2} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          url={MAPBOX_KEY ? MAPBOX_DEFAULT_URL : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'}
          attribution={MAPBOX_KEY ?
            '© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> © OpenStreetMap' :
            '© OpenStreetMap contributors'}
          errorTileUrl=""
          eventHandlers={{
            tileerror: (e) => setMapboxError('Tiles could not load; check API key or style.'),
          }}
        />
        {route.length > 0 && (
          <>
            {route.map((city, i) => (
              <Marker key={city} position={getCoords(city)}>
                <Popup>{city}</Popup>
              </Marker>
            ))}
            <Polyline
              positions={route.map(c => getCoords(c))}
              color="#f8b14f"
              weight={5}
              opacity={0.7}
            />
          </>
        )}
      </MapContainer>
    </div>
  );
}

function WeatherInfo({ city }) {
  // Uses OpenWeatherMap demo API for free plan - or you can configure from .env
  const API_KEY = process.env.REACT_APP_OPENWEATHER_KEY || 'f5012ea0e9a34d4945a6b6bf9258d6f8';
  const [weather, setWeather] = useState(null);
  const [status, setStatus] = useState('idle');
  useEffect(() => {
    if (!city) return;
    setStatus('loading');
    fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&units=metric&appid=${API_KEY}`
    )
      .then(response => response.json())
      .then(data => {
        setWeather(data);
        setStatus('success');
      })
      .catch(e => setStatus('error'));
  }, [city, API_KEY]);

  if (!city) return <div style={{fontStyle:'italic', color:'#b3eca7'}}>Select a city to get weather.</div>;
  if (status === 'loading') return <div>Loading weather for <span style={{color:'#cb7cb6'}}>{city}</span>...</div>;
  if (status === 'error' || weather?.cod === "404") return <div style={{color:'#e57373'}}>Weather unavailable for {city}.</div>;
  if (!weather) return null;

  return (
    <div style={{background:'#cb7cb6', borderRadius:10, padding:18, margin: '18px auto', maxWidth:300}}>
      <div style={{fontSize:'1.08em', fontWeight: 600}}>{weather.name} Weather</div>
      <div>🌡 {weather.main?.temp}&deg;C | {weather.weather?.[0]?.main}</div>
      <div style={{fontSize: '0.96em', color: '#f8b14f'}}>{weather.weather?.[0]?.description}</div>
      <div>💧 Humidity: {weather.main?.humidity}%</div>
      <div>🌬 Wind: {weather.wind?.speed} m/s</div>
    </div>
  );
}

// Fake "AI" for demonstration - in production, call Cohere or OpenAI API
function AISuggestions({ itinerary }) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([
    { isUser: false, text: "Hi! I'm your AI travel assistant. How can I help with your trip?" }
  ]);
  function askAI(e) {
    e.preventDefault();
    const userText = input.trim();
    if (!userText) return;
    setMessages(m => [...m, { isUser: true, text: userText }]);
    setInput('');
    // Pretend AI response
    setTimeout(() => {
      setMessages(m => [...m, {
        isUser: false, text:
          `/ai: For "${userText}" – Try visiting top-rated museums, explore local cuisine, and check the weather before you go!`
      }]);
    }, 900);
  }
  return (
    <div>
      <div style={{margin: '20px 0', textAlign:'center', color:'#cb7cb6'}}>Ask the AI anything about trip planning, cities, packing tips, or routes!</div>
      <div style={{
        background:'#f4f4f4', color:'#111',borderRadius:10, padding:18, maxWidth:540,margin:'0 auto', boxShadow:'0 3px 12px #0001'
      }}>
        <div style={{minHeight:110}}>
          {messages.map((msg, i) => (
            <div key={i} style={{
              margin: '9px 0',
              textAlign: msg.isUser ? 'right' : 'left',
              color: msg.isUser ? '#8d3acf' : '#38988f'
            }}>
              {msg.isUser ? <b>You: </b> : <b>AI: </b>}{msg.text}
            </div>
          ))}
        </div>
        <form onSubmit={askAI} style={{marginTop:16, display:'flex', gap:8}}>
          <input type="text" value={input} onChange={e=>setInput(e.target.value)} placeholder="Ask about travel..." style={{
            flex:1,padding:10,borderRadius:7,border:'1px solid #b3eca7'
          }} />
          <button type="submit" className="btn" style={{background:'#8d3acf', color:'#fff'}}>Send</button>
        </form>
      </div>
      {(itinerary && itinerary.length > 0) && (
        <div style={{marginTop:22, color:'#b3eca7'}}>
          <b>Your Itinerary:</b> {itinerary.join(' › ')}
        </div>
      )}
    </div>
  );
}

function WeatherPage({ route }) {
  const [city, setCity] = useState(route && route.length ? route[0] : '');
  useEffect(() => {
    if (route.length) setCity(route[0]);
  }, [route]);
  return (
    <div style={{paddingTop:44}}>
      <div style={{marginBottom:20}}>Check weather for a city on your itinerary:</div>
      <select value={city} onChange={e=>setCity(e.target.value)} style={{padding:10, borderRadius:7}}>
        <option value="">Select city</option>
        {route.map(c=>(
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
      <WeatherInfo city={city} />
    </div>
  );
}

// PUBLIC_INTERFACE
export default function App() {
  const [currentPage, setCurrentPage] = useState('home');
  const [userRoute, setUserRoute] = useState([]);

  return (
    <UserRouteContext.Provider value={{ route: userRoute, setRoute: setUserRoute }}>
      <div className="app">
        <Navbar currentPage={currentPage} onNavigate={setCurrentPage} />

        <main>
          <div className="container">
          {currentPage === 'home' && <HomePage onNavigate={setCurrentPage} />}
          {currentPage === 'planner' && <section style={{marginTop:44}}>
            <h2 style={{color:'#cb7cb6', marginBottom:8}}>Plan Your Trip</h2>
            <PlannerPage onSetRoute={setUserRoute} />
            {/* Map is intentionally NOT rendered in PlannerPage. Only planner/results UI here. */}
          </section>}
          {currentPage === 'map' && (
            <section style={{marginTop:44}}>
              <h2 style={{color:'#b3eca7', marginBottom:8}}>Interactive Map</h2>
              <TravelMap key={userRoute.join('_')} />
            </section>
          )}
          {currentPage === 'weather' && (
            <section>
              <h2 style={{color:'#f8b14f', marginTop:40}}>Weather Updates</h2>
              <WeatherPage route={userRoute} />
            </section>
          )}
          {currentPage === 'ai' && (
            <section>
              <h2 style={{color:'#cb7cb6', marginTop:40}}>AI Travel Suggestions</h2>
              <AISuggestions itinerary={userRoute} />
            </section>
          )}
          </div>
        </main>
      </div>
    </UserRouteContext.Provider>
  );
}
