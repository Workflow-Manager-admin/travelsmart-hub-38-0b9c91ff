import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import './App.css';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// Context to share itinerary/route between planner and map
const UserRouteContext = createContext();

/**
 * Mapbox tile support: configure API Key securely from .env.
 * Must define REACT_APP_MAPBOX_KEY in your .env file at project root.
 * For public fallback OpenStreetMap, leave blank or unset.
 */
const MAPBOX_KEY = process.env.REACT_APP_MAPBOX_KEY || ""; // required for Mapbox maps
const MAPBOX_STYLE = process.env.REACT_APP_MAPBOX_STYLE || "light-v11"; // optionally customize style in .env
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
 * PlannerPage: Real-world integration would include Amadeus API usage (flight search, etc).
 * Place Amadeus API key in .env as REACT_APP_AMADEUS_API_KEY.
 * Example fetch usage:
 *   fetch(`https://api.amadeus.com/route?from=X&to=Y`, {
 *     headers: { Authorization: `Bearer ${process.env.REACT_APP_AMADEUS_API_KEY}` }
 *   })
 * See README for details.
 */
// PUBLIC_INTERFACE
function PlannerPage({ onSetRoute }) {
  // Form states
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [itinerary, setItinerary] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Fetch Sambonova API keys and endpoint config from .env (configurable to fix 404 routing/version issues)
  // Note: VITE_ or REACT_APP_ is required for env vars to be exposed
  const SN_API_KEY = process.env.REACT_APP_SAMBONOVA_API_KEY || "";
  const SN_MODEL = process.env.REACT_APP_SAMBONOVA_MODEL || "sambonova/sambocrn-v1-chat";
  const SN_API_BASE = process.env.REACT_APP_SAMBONOVA_API_BASE || "https://api.sambonova.ai";
  const SN_API_VERSION = process.env.REACT_APP_SAMBONOVA_API_VERSION || "v1";
  const SN_API_CHAT_ENDPOINT = process.env.REACT_APP_SAMBONOVA_CHAT_ENDPOINT || "/chat/completions";

  // PUBLIC_INTERFACE
  async function fetchSamboItinerary({ from, to, startDate, endDate }) {
    // Compose endpoint for flexibility and to allow environment-driven fix for misconfigured routes/404s
    const endpoint =
      SN_API_BASE.replace(/\/+$/, '') + '/' +
      SN_API_VERSION.replace(/^\/+|\/+$/g, '') +
      (SN_API_CHAT_ENDPOINT.startsWith('/') ? SN_API_CHAT_ENDPOINT : '/' + SN_API_CHAT_ENDPOINT);

    const inputPrompt =
      `You are a trip itinerary planner. Suggest a day-by-day, realistic itinerary for a trip:\n` +
      `- From: ${from}\n- To: ${to}\n- Travel dates: ${startDate} to ${endDate}\n` +
      `Present the itinerary in readable and organized Markdown with day-wise breakdown.`;

    // Diagnostics: Log all env config and request params
    const missingVars = [];
    if (!SN_API_KEY) missingVars.push("REACT_APP_SAMBONOVA_API_KEY");
    if (!SN_MODEL) missingVars.push("REACT_APP_SAMBONOVA_MODEL");
    if (!SN_API_BASE) missingVars.push("REACT_APP_SAMBONOVA_API_BASE");
    if (!SN_API_VERSION) missingVars.push("REACT_APP_SAMBONOVA_API_VERSION");
    if (!SN_API_CHAT_ENDPOINT) missingVars.push("REACT_APP_SAMBONOVA_CHAT_ENDPOINT");

    console.group("Sambonova AI Diagnostics");
    console.log("Fetch endpoint:", endpoint);
    console.log("Model:", SN_MODEL);
    console.log("API Key (truncated):", SN_API_KEY ? (SN_API_KEY.slice(0, 8) + "...") : "(missing)");
    console.log("Env API Base:", SN_API_BASE);
    console.log("Env Version:", SN_API_VERSION);
    console.log("Chat Endpoint:", SN_API_CHAT_ENDPOINT);
    if (missingVars.length > 0) {
      console.warn("Missing/undefined env vars:", missingVars.join(", "));
      if (typeof window !== "undefined") {
        window._SN_MISSING_ENV_VARS = missingVars;
      }
    }
    console.log("Fetch request params:", { from, to, startDate, endDate });
    console.log("Request body preview:", {
      model: SN_MODEL,
      messages: [
        { role: "system", content: "You are a helpful travel itinerary assistant." },
        { role: "user", content: inputPrompt }
      ],
      max_tokens: 800
    });
    console.log("Fetch config: mode: 'cors', method: 'POST', headers: {...}");

    // Prepare fetch options
    const fetchOptions = {
      method: "POST",
      mode: "cors", // EXPLICIT
      headers: {
        "Authorization": `Bearer ${SN_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: SN_MODEL,
        messages: [
          { role: "system", content: "You are a helpful travel itinerary assistant." },
          { role: "user", content: inputPrompt }
        ],
        max_tokens: 800
      })
    };

    // Diagnostic output in UI for errors or warnings
    let diagnosticsMsg = "";
    if (missingVars.length > 0) {
      diagnosticsMsg += "⚠️ Missing required API env vars: " + missingVars.join(", ") +
        ".\nSee project README for how to configure .env. You must use REACT_APP_ prefix in Create React App.\n";
    }
    // Try/catch for all errors including network/CORS
    try {
      setLoading(true);
      if (diagnosticsMsg) setError(diagnosticsMsg); // show env config issues
      const resp = await fetch(endpoint, fetchOptions);

      // Log full response/headers for debugging (async)
      let respClone;
      try {
        respClone = resp.clone();
        respClone
          .text()
          .then(txt => {
            console.log("Raw fetch response (text):", txt);
            try {
              const asJson = JSON.parse(txt);
              console.log("Parsed fetch response (JSON):", asJson);
            } catch { /** ignore */ }
          });
      } catch (e) {
        console.warn("Could not clone/inspect fetch response", e);
      }

      if (!resp.ok) {
        let errText = await resp.text();
        console.error("Sambonova error HTTP", resp.status, resp.statusText, errText);
        diagnosticsMsg += `Sambonova error: ${resp.status} (${resp.statusText})
API Endpoint: ${endpoint}
Response: ${errText}`;
        throw new Error(diagnosticsMsg);
      }
      let data;
      try {
        data = await resp.json();
        console.log("Final parsed response object:", data);
      } catch (err) {
        diagnosticsMsg += "\nFailed to parse JSON from Sambonova response.";
        console.error("Response parse error:", err);
        throw new Error(diagnosticsMsg);
      }
      // Expect either a "choices[0].message.content" or similar structure.
      const resultText =
        data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || data?.result || "";
      if (!resultText) {
        diagnosticsMsg += "\nNo itinerary or answer returned by Sambonova AI.";
        throw new Error(diagnosticsMsg);
      }
      setItinerary({ markdown: resultText });
      setError(""); // clear error if successful
      console.groupEnd();
    } catch (err) {
      // Log stack and error to console
      console.error("AI API network/fetch error:", err);
      diagnosticsMsg += (err && err.message) ? err.message : String(err);
      diagnosticsMsg += "\n\nIf this request failed, check your browser devtools (F12 → Network tab) for failed HTTP requests for more detail. For CORS/network errors, see documentation or API status page. Verify .env variables and endpoint format. Reload with Ctrl+Shift+R after changes.";
      setError(diagnosticsMsg);
      setItinerary(null);
      console.groupEnd?.();
    } finally {
      setLoading(false);
    }
  }

  // Form submission handler
  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setItinerary(null);
    if (!from || !to || !startDate || !endDate) {
      setError("Please fill in all fields.");
      return;
    }
    if (new Date(endDate) < new Date(startDate)) {
      setError("End date must not be before start date.");
      return;
    }
    // For map route updating, only [from, to]
    onSetRoute([from, to]);
    // Call Sambonova AI for itinerary generation
    await fetchSamboItinerary({ from, to, startDate, endDate });
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
        {/* Error display */}
        {error && <div style={{
          color:'#e57373',
          background: 'rgba(255,255,255,0.10)',
          border: '1.5px solid #f084c3',
          borderRadius: '7px',
          margin: '8px 0',
          fontSize: "1.01em",
          fontFamily: "monospace",
          whiteSpace:"pre-line",
          padding: "10px 12px"
        }}>
          {error.split('\n').map((line, i) => <div key={i}>{line}</div>)}
        </div>}
        <button disabled={loading} type="submit" className="btn btn-large" style={{ background: "#cb7cb6", color:'#fff', marginTop:6 }}>
          {loading ? "Generating Itinerary..." : "Generate Itinerary"}
        </button>
      </form>
      {/* Results */}
      {itinerary?.markdown && (
        <div style={{marginTop:22}}>
          <h3 style={{marginBottom:8, color:'#b3eca7'}}>AI-Generated Itinerary</h3>
          <div
            style={{
              background: "#2226",
              borderRadius: 10,
              padding: "14px 18px",
              whiteSpace: "pre-line",
              color: "#fff",
              fontSize: "1.065em",
              marginTop: 8,
              boxShadow: "0 0 7px #b3eca766"
            }}
            // Render Markdown output
            dangerouslySetInnerHTML={{
              __html: sanitizeMarkdown(itinerary.markdown)
            }}
          />
        </div>
      )}
    </div>
  );
}

// Simple minimal Markdown sanitizer/renderer (strongs/headings/lists/italics/line-breaks).
// For real-world, use 'marked' or 'react-markdown' library.
function sanitizeMarkdown(md) {
  if (!md) return "";
  let html = md
    .replace(/^### (.*)$/gm, '<h3>$1</h3>')
    .replace(/^## (.*)$/gm, '<h2>$1</h2>')
    .replace(/^# (.*)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.*?)\*/g, '<i>$1</i>')
    .replace(/^- (.*)$/gm, '<ul><li>$1</li></ul>')
    .replace(/\n{2,}/g, '<br/>')
    .replace(/\n/g, '<br/>');
  // Merge adjacent <ul>s
  html = html.replace(/<\/ul><ul>/g, '');
  return html;
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

/**
 * TravelMap displays only the current itinerary/route on the map and clears all old markers/routes on every update.
 * The map is never rendered in the PlannerPage itself, only on the MapPage or wherever TravelMap is used.
 */
// PUBLIC_INTERFACE
function TravelMap() {
  const { route } = useContext(UserRouteContext);
  const [mapboxError, setMapboxError] = useState('');
  // Center to user's first route or default to Europe
  const center = route && route.length > 0 ? getCoords(route[0]) : [48.85, 2.35];

  // Force a map reset (clear all markers/polyline) by using key
  // Only the latest route is ever rendered
  return (
    <div style={{ position: 'relative', height: 420, marginTop: 18, borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 16px #00000022' }}>
      <MapboxErrorBanner error={mapboxError} />
      <MapContainer
        key={route.join('_') || 'empty'} // Remount map to clear previous on route change
        center={center}
        zoom={2}
        style={{ height: '100%', width: '100%' }}
      >
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
        {(route.length > 0) && (
          <>
            {route.map((city, i) => (
              <Marker key={city + i} position={getCoords(city)}>
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
  /**
   * OpenWeatherMap API Key:
   * Set your OpenWeatherMap key in .env as REACT_APP_OPENWEATHER_KEY for security.
   * Example .env line:
   *   REACT_APP_OPENWEATHER_KEY=your-real-openweathermap-key
   */
  const API_KEY = process.env.REACT_APP_OPENWEATHER_KEY || "";
  const [weather, setWeather] = useState(null);
  const [status, setStatus] = useState('idle');
  useEffect(() => {
    if (!city) return;
    if (!API_KEY) {
      setStatus('no_key');
      return;
    }
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

  if (!city) return <div style={{ fontStyle: 'italic', color: '#b3eca7' }}>Select a city to get weather.</div>;
  if (status === 'no_key') return (
    <div style={{
      color: '#e57373',
      background: '#fff5',
      border: '1.5px solid #f084c3',
      borderRadius: 7,
      fontSize: "1.01em",
      margin: "12px 0",
      padding: "10px 12px"
    }}>
      <b>Weather API key missing:</b> Please set <code>REACT_APP_OPENWEATHER_KEY</code> in your <b>.env</b> file.<br />
      See project README for setup instructions.
    </div>
  );
  if (status === 'loading') return <div>Loading weather for <span style={{ color: '#cb7cb6' }}>{city}</span>...</div>;
  if (status === 'error' || weather?.cod === "404") return <div style={{ color: '#e57373' }}>Weather unavailable for {city}.</div>;
  if (!weather) return null;

  return (
    <div style={{ background: '#cb7cb6', borderRadius: 10, padding: 18, margin: '18px auto', maxWidth: 300 }}>
      <div style={{ fontSize: '1.08em', fontWeight: 600 }}>{weather.name} Weather</div>
      <div>🌡 {weather.main?.temp}&deg;C | {weather.weather?.[0]?.main}</div>
      <div style={{ fontSize: '0.96em', color: '#f8b14f' }}>{weather.weather?.[0]?.description}</div>
      <div>💧 Humidity: {weather.main?.humidity}%</div>
      <div>🌬 Wind: {weather.wind?.speed} m/s</div>
    </div>
  );
}

/**
 * Cohere API key integration:
 * For production, set your Cohere key as REACT_APP_COHERE_API_KEY in your .env file.
 * For Amadeus, use REACT_APP_AMADEUS_API_KEY in .env as well.
 * Example:
 *   REACT_APP_COHERE_API_KEY=your-real-cohere-key
 *   REACT_APP_AMADEUS_API_KEY=your-amadeus-key
 * Replace mock below with real fetch call using these vars.
 */
// Fake "AI" for demonstration - in production, call Cohere or OpenAI API using process.env.REACT_APP_COHERE_API_KEY
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
    // === To use Cohere, replace below with a fetch using process.env.REACT_APP_COHERE_API_KEY ===
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

/**
 * Enhanced WeatherPage: 
 * - Toggle between 'Planned Destination' and manual search.
 * - In 'planned' mode: always uses current destination (first element in route).
 * - In 'search' mode: allows searching and viewing any city.
 * - Reactively syncs to context/route changes unless user is in 'search' mode.
 */
function WeatherPage({ route }) {
  // "mode" = 'planned' or 'search'
  const [mode, setMode] = useState('planned');
  // For search mode
  const [searchInput, setSearchInput] = useState('');
  const [searchCity, setSearchCity] = useState('');
  // For planned dest (route)
  const plannedCity = route && route.length ? route[route.length - 1] : '';

  // Effect: In planned mode, always show/fetch the planned destination as it changes.
  useEffect(() => {
    if (mode === 'planned') {
      // Reset search if switching from search mode
      setSearchInput('');
      setSearchCity('');
    }
    // No need to set state for plannedCity; it's computed from route
  }, [mode, route]);

  // UI - clear toggle buttons, react idioms
  return (
    <div style={{ paddingTop: 44, maxWidth: 500, margin: "0 auto" }}>
      <div style={{ marginBottom: 14, display: 'flex', gap: 12, justifyContent: 'center' }}>
        <button
          className="btn"
          style={{
            background: mode === 'planned' ? '#f8b14f' : '#b3eca7',
            color: mode === 'planned' ? '#fff' : '#222',
            borderBottom: mode === 'planned' ? '2px solid #cb7cb6' : 'none',
            minWidth: 120
          }}
          onClick={() => setMode('planned')}
          disabled={mode === 'planned'}
        >
          Planned Destination
        </button>
        <button
          className="btn"
          style={{
            background: mode === 'search' ? '#f8b14f' : '#b3eca7',
            color: mode === 'search' ? '#fff' : '#222',
            borderBottom: mode === 'search' ? '2px solid #cb7cb6' : 'none',
            minWidth: 120
          }}
          onClick={() => setMode('search')}
          disabled={mode === 'search'}
        >
          Search Anywhere
        </button>
      </div>
      {mode === 'planned' ? (
        <div>
          <div style={{ marginBottom: 12, textAlign: "center" }}>
            Showing weather for your <b>planned destination</b>:
          </div>
          <div style={{ marginBottom: 14, display: "flex", justifyContent: "center", gap: 8 }}>
            <select
              value={plannedCity || ""}
              onChange={() => {}} // disables manual change
              style={{ padding: 10, borderRadius: 7, minWidth: 140 }}
              disabled
            >
              {/* Show only planned city */}
              <option value="">
                {plannedCity ? plannedCity : "No destination set"}
              </option>
            </select>
          </div>
          <WeatherInfo city={plannedCity} />
        </div>
      ) : (
        <div>
          <div style={{ marginBottom: 14, textAlign: "center" }}>
            <span>Search and view weather for <b>any city</b>:</span>
          </div>
          <form
            style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center", marginBottom: 10 }}
            onSubmit={e => {
              e.preventDefault();
              if (searchInput.trim()) setSearchCity(searchInput.trim());
            }}
          >
            <input
              type="text"
              value={searchInput}
              placeholder="Type city name..."
              onChange={e => setSearchInput(e.target.value)}
              style={{ padding: 8, borderRadius: 7, border: "1px solid #cb7cb6", minWidth: 130, flex: 1 }}
              autoFocus
            />
            <button
              className="btn"
              style={{ background: "#cb7cb6", color: "#fff", padding: "10px 18px" }}
              type="submit"
            >
              Search
            </button>
          </form>
          {searchCity && (
            <WeatherInfo city={searchCity} />
          )}
        </div>
      )}
      <div style={{ marginTop: 28, color: "#b3eca7", fontSize: "1em", textAlign: "center" }}>
        <span style={{opacity:0.70}}>Tip: Your planned destination is always shown by default. Switch to <b>Search Anywhere</b> to check other cities.</span>
      </div>
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
