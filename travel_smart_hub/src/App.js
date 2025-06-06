import React, { useState, useEffect, useContext, createContext } from 'react';
import './App.css';

// --- Theme Variables Set (light theme, custom colors)
const themeColors = {
  '--primary': '#f084c3',
  '--secondary': '#f47b7b',
  '--accent': '#ebf28c',
  '--navbar-bg': '#fff',
  '--navbar-fg': '#111',
  '--navbar-border': '#eee',
  '--page-bg': '#fcfcfc',
  '--card-bg': '#fff',
  '--card-border': '#e5e5e5'
};

// PUBLIC_INTERFACE
function setThemeVars(vars) {
  for (const key in vars) {
    document.documentElement.style.setProperty(key, vars[key]);
  }
}
setThemeVars(themeColors);

// ----- Itinerary Context -----
const ItineraryContext = createContext();

export function useItinerary() {
  return useContext(ItineraryContext);
}

function ItineraryProvider({ children }) {
  const [itineraries, setItineraries] = useState([]);
  const addItinerary = (itinerary) => {
    setItineraries((all) => [...all, itinerary]);
  };
  const value = { itineraries, setItineraries, addItinerary };
  return (
    <ItineraryContext.Provider value={value}>
      {children}
    </ItineraryContext.Provider>
  );
}

// ----- Responsive Navigation Bar -----
const navItems = [
  { key: 'home', label: 'Home' },
  { key: 'planner', label: 'Planner' },
  { key: 'map', label: 'Map' },
  { key: 'weather', label: 'Weather' },
  { key: 'ai', label: 'AI' }
];

function Navbar({ current, setCurrent }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  // PUBLIC_INTERFACE
  const handleNav = (key) => {
    setCurrent(key);
    setMobileOpen(false);
  };

  return (
    <nav className="navbar-hub">
      <div className="ns-main">
        <div className="logo-hub" aria-label="TravelSmart Hub">
          <span className="logo-circle" style={{ color: themeColors['--primary'] }}>✈️</span>
          <span style={{ color: themeColors['--secondary'], fontWeight: 700, marginLeft: 4 }}>TravelSmart Hub</span>
        </div>
        <button className="menu-btn" aria-label="Toggle menu" onClick={() => setMobileOpen((m) => !m)}>
          <span />
          <span />
          <span />
        </button>
        <ul className={`navbar-links ${mobileOpen ? 'open' : ''}`}>
          {navItems.map(item => (
            <li key={item.key}>
              <button
                className={`navbar-link${current === item.key ? ' active' : ''}`}
                onClick={() => handleNav(item.key)}
                style={current === item.key ? { color: themeColors['--primary'] } : {}}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

// ----- Home Page -----
function Home() {
  return (
    <section className="page-content">
      <h2>Welcome to <span style={{ color: themeColors["--primary"] }}>TravelSmart Hub</span>!</h2>
      <p>Your all-in-one smart travel companion. Plan trips, visualize destinations, check real-time weather, and get personalized recommendations—all in one place.</p>
      <ul className="feature-list">
        {[
          "Responsive navigation for smooth travel experience",
          "Real-time itineraries powered by Amadeus API",
          "Interactive Map (Mapbox/OpenStreetMap)",
          "Live Weather Updates (OpenWeatherMap)",
          "AI Travel Assistant (Cohere)",
          "Share itineraries across all app pages"
        ].map((x, i) => (
          <li key={i}><span className="dot" style={{ background: themeColors['--accent'] }}/> {x}</li>
        ))}
      </ul>
    </section>
  );
}

// ----- Planner Page -----
function Planner() {
  const { itineraries, addItinerary } = useItinerary();
  const [form, setForm] = useState({ from: '', to: '', date: '' });
  const [fetching, setFetching] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  // PUBLIC_INTERFACE
  async function fetchItinerary() {
    setFetching(true);
    setError('');
    setResult(null);
    // NOTE: Replace with your actual credentials (e.g. via env variables)
    const client_id = "REPLACE_WITH_YOUR_AMADEUS_CLIENT_ID";
    const client_secret = "REPLACE_WITH_YOUR_AMADEUS_CLIENT_SECRET";

    try {
      // Step 1: Get access token
      const authResp = await fetch("https://test.api.amadeus.com/v1/security/oauth2/token", {
        method: "POST",
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id, client_secret
        }),
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
      });
      if (!authResp.ok) throw new Error("Unable to authenticate with Amadeus API");
      const authData = await authResp.json();

      // Step 2: Fetch flight offers
      // For demo: Only fetch if from/to/date are filled and simple airport codes
      if (!form.from || !form.to || !form.date) {
        setError("Please enter departure, arrival, and date.");
        setFetching(false);
        return;
      }
      const offersResp = await fetch(
        `https://test.api.amadeus.com/v2/shopping/flight-offers?originLocationCode=${form.from.toUpperCase()}&destinationLocationCode=${form.to.toUpperCase()}&departureDate=${form.date}&adults=1&max=3`,
        {
          headers: { Authorization: `Bearer ${authData.access_token}` }
        }
      );
      if (!offersResp.ok) throw new Error("Unable to fetch itinerary offers.");
      const offers = await offersResp.json();
      const topOffer = offers.data && offers.data.length ? offers.data[0] : null;
      setResult(topOffer);
      if (topOffer) {
        addItinerary({ from: form.from, to: form.to, date: form.date, details: topOffer });
      }
    } catch (e) {
      setError(e.message || "Failed to fetch itinerary.");
    } finally {
      setFetching(false);
    }
  }

  return (
    <section className="page-content">
      <h2>Trip Planner (Amadeus API)</h2>
      <form
        className="plan-form"
        onSubmit={e => { e.preventDefault(); fetchItinerary(); }}
        style={{ background: themeColors['--card-bg'], border: `1px solid ${themeColors['--card-border']}` }}
      >
        <label>From (IATA Code): <input value={form.from} onChange={e => setForm({ ...form, from: e.target.value })} placeholder="e.g. JFK" required /></label>
        <label>To (IATA Code): <input value={form.to} onChange={e => setForm({ ...form, to: e.target.value })} placeholder="e.g. LHR" required /></label>
        <label>Date: <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required /></label>
        <button className="btn" disabled={fetching}>{fetching ? "Fetching..." : "Get Itinerary"}</button>
      </form>
      {error && <div className="error-msg">{error}</div>}
      {result &&
        <div className="itinerary-card" style={{ border: `1px solid ${themeColors['--primary']}` }}>
          <h4>Sample Itinerary</h4>
          <div><b>From:</b> {form.from.toUpperCase()} &rarr; <b>To:</b> {form.to.toUpperCase()} on {form.date}</div>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.9em' }}>{JSON.stringify(result, null, 2)}</pre>
        </div>
      }
      <div style={{ margin: '28px 0 0' }}>
        <h3>Your Saved Itineraries</h3>
        {itineraries.length === 0 ? (<div>No itineraries yet.</div>) : (
          <ul>
            {itineraries.map((it, i) => (
              <li key={i}><b>{it.from.toUpperCase()} -&gt; {it.to.toUpperCase()}</b> {it.date}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// ----- Map Page (Leaflet + OpenStreetMap) -----
function MapPage() {
  // Using a static embed for demonstration. Real use: react-leaflet, Mapbox GL JS, or similar
  // Map view centered on Europe by default
  return (
    <section className="page-content">
      <h2>Destinations Map</h2>
      <iframe
        title="map"
        src="https://www.openstreetmap.org/export/embed.html?bbox=-0.5632%2C51.2802%2C0.2789%2C51.6831&amp;layer=mapnik"
        style={{ width: '100%', height: 350, border: `2px solid ${themeColors['--primary']}`, borderRadius: 12 }}
        allowFullScreen
        loading="lazy"
      />
      <div style={{ fontSize: '0.9em', color: '#555', marginTop: 10 }}>
        Powered by OpenStreetMap. For interactive route-planning, use the planner and select destinations.<br/>
        (For advanced maps, integrate Mapbox or Leaflet here.)
      </div>
    </section>
  );
}

// ----- Weather Page -----
function WeatherPage() {
  const [query, setQuery] = useState('');
  const [weather, setWeather] = useState(null);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');

  // PUBLIC_INTERFACE
  async function fetchWeather() {
    setFetching(true); setError(''); setWeather(null);
    // NOTE: Replace with your OpenWeatherMap API Key
    const apiKey = "REPLACE_WITH_YOUR_OPENWEATHERMAP_API_KEY";
    try {
      // Search by city name or IATA code (not a direct mapping, but demo purposes)
      if (!query) {
        setError("Please enter a city name.");
        setFetching(false);
        return;
      }
      const resp = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(query)}&appid=${apiKey}&units=metric`
      );
      if (!resp.ok) throw new Error("Weather not found!");
      const data = await resp.json();
      setWeather(data);
    } catch (e) {
      setError(e.message || "Could not fetch weather.");
    } finally {
      setFetching(false);
    }
  }

  return (
    <section className="page-content">
      <h2>Weather Updates</h2>
      <form
        className="plan-form"
        onSubmit={e => { e.preventDefault(); fetchWeather(); }}
        style={{ background: themeColors['--card-bg'], border: `1px solid ${themeColors['--card-border']}` }}
      >
        <label>City name: <input value={query} onChange={e => setQuery(e.target.value)} placeholder="London" required /></label>
        <button className="btn" disabled={fetching}>{fetching ? "Loading..." : "Check Weather"}</button>
      </form>
      {error && <div className="error-msg">{error}</div>}
      {weather &&
        <div className="weather-card" style={{ border: `2px solid ${themeColors['--secondary']}` }}>
          <h4>{weather.name}, {weather.sys?.country}</h4>
          <div style={{ fontSize: '1.8em', fontWeight: 500 }}>{weather.main.temp}&deg;C</div>
          <div>{weather.weather[0].description}</div>
          <div><small>Wind: {weather.wind.speed} m/s, Humidity: {weather.main.humidity}%</small></div>
        </div>
      }
    </section>
  );
}

// ----- AI Assistant Page (Cohere API) -----
function AIAssistant() {
  const [input, setInput] = useState('');
  const [msgs, setMsgs] = useState([]);
  const [fetching, setFetching] = useState(false);

  // PUBLIC_INTERFACE
  async function askAssistant(promptText) {
    setFetching(true);
    // NOTE: Replace with your Cohere API key
    const cohereApiKey = "REPLACE_WITH_YOUR_COHERE_API_KEY";
    try {
      const resp = await fetch("https://api.cohere.ai/v1/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${cohereApiKey}`
        },
        body: JSON.stringify({
          model: "command",
          message: promptText,
          chat_history: [],
        })
      });
      if (!resp.ok) throw new Error("AI Assistant error.");
      const data = await resp.json();
      setMsgs(msgs => [
        ...msgs,
        { role: 'user', content: promptText },
        { role: 'assistant', content: data.text ? data.text : "No response." }
      ]);
    } catch (e) {
      setMsgs(msgs => [
        ...msgs,
        { role: 'assistant', content: "Sorry, I couldn't fetch a response. Check your Cohere API key." }
      ]);
    } finally {
      setFetching(false);
    }
  }

  const handleSubmit = e => {
    e.preventDefault();
    if (input.trim().length === 0) return;
    askAssistant(input.trim());
    setInput('');
  };

  return (
    <section className="page-content">
      <h2>AI Travel Assistant</h2>
      <form className="ai-form" onSubmit={handleSubmit}>
        <input
          className="ai-input"
          value={input}
          disabled={fetching}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask for a travel suggestion, e.g. best route from Paris to Rome"
          style={{ borderColor: themeColors['--primary'] }}
        />
        <button className="btn" disabled={fetching || !input.trim()} type="submit">
          {fetching ? "Asking..." : "Ask"}
        </button>
      </form>
      <div className="ai-chat">
        {msgs.length === 0 && <div style={{ color: '#888', padding: 16 }}>Ask anything about travel planning.</div>}
        {msgs.map((m, i) => (
          <div
            key={i}
            className={`chat-msg ${m.role}`}
            style={m.role === 'user'
              ? { background: themeColors['--accent'], alignSelf: 'flex-end' }
              : { background: themeColors['--primary'], color: '#fff', alignSelf: 'flex-start' }}
          >
            <b>{m.role === 'user' ? 'You' : 'AI'}:</b> {m.content}
          </div>
        ))}
      </div>
      <div style={{ fontSize: '0.85em', color: '#999', marginTop: 10 }}>Powered by Cohere AI.</div>
    </section>
  );
}

// ----- Main App -----
function App() {
  const [currentPage, setCurrentPage] = useState('home');
  let CurrentComponent;
  switch (currentPage) {
    case 'planner': CurrentComponent = Planner; break;
    case 'map': CurrentComponent = MapPage; break;
    case 'weather': CurrentComponent = WeatherPage; break;
    case 'ai': CurrentComponent = AIAssistant; break;
    default: CurrentComponent = Home;
  }

  return (
    <ItineraryProvider>
      <div className="app hub-main-light" style={{ background: themeColors['--page-bg'], minHeight: '100vh' }}>
        <Navbar current={currentPage} setCurrent={setCurrentPage} />
        <main className="hub-main-content" style={{ marginTop: 80, minHeight: '70vh' }}>
          <CurrentComponent />
        </main>
        <footer className="footer-hub" style={{
          background: themeColors['--navbar-bg'],
          borderTop: `1px solid ${themeColors['--navbar-border']}`,
          color: '#555',
          textAlign: 'center',
          padding: '12px 0',
          fontSize: '0.96em',
          marginTop: '48px'
        }}>
          <span>TravelSmart Hub &copy; {new Date().getFullYear()} &ndash; Smart journeys start here.</span>
        </footer>
      </div>
    </ItineraryProvider>
  );
}

export default App;
