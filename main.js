// Debug logging
console.log('WeatherMan app starting...');
console.log('Config loaded:', typeof config);
console.log('API Key available:', !!config?.OPENWEATHER_API_KEY);

// Fail fast if config.js or API key is missing (helps on Vercel)
if (!window.config || !config.OPENWEATHER_API_KEY) {
    alert('Missing config.js or OPENWEATHER_API_KEY. Ensure /config.js is deployed and loaded before main.js.');
}

// Fallback API key if config doesn't load (optional: keep empty to enforce deploy correctness)
const OPENWEATHER_API_KEY = config?.OPENWEATHER_API_KEY;
const state = {
    cities: [],
    selectedCity: null
};

const els = {
    cards: document.getElementById("city-cards"),
    cardTpl: document.getElementById("city-card-template"),
    searchInput: document.getElementById("search-input"),
    searchBtn: document.getElementById("search-btn"),
    locationBtn: document.getElementById("location-btn"),
    forecastList: document.getElementById("forecast-list"),
    nowDay: document.getElementById("now-day"),
    nowTemp: document.getElementById("now-temp"),
    detailCity: document.getElementById("detail-city"),
    currentTab: document.getElementById("current-tab"),
    forecastTab: document.getElementById("forecast-tab"),
    detailsTab: document.getElementById("details-tab"),
    currentTemp: document.getElementById("current-temp"),
    weatherDesc: document.getElementById("weather-desc"),
    feelsLike: document.getElementById("feels-like"),
    minMax: document.getElementById("min-max"),
    humidity: document.getElementById("humidity"),
    wind: document.getElementById("wind"),
    visibility: document.getElementById("visibility"),
    pressure: document.getElementById("pressure"),
    uvIndex: document.getElementById("uv-index"),
    sunrise: document.getElementById("sunrise"),
    sunset: document.getElementById("sunset"),
    windDirection: document.getElementById("wind-direction"),
    windGust: document.getElementById("wind-gust"),
    cloudCover: document.getElementById("cloud-cover"),
    rain1h: document.getElementById("rain-1h"),
    snow1h: document.getElementById("snow-1h"),
    dewPoint: document.getElementById("dew-point"),
    localTime: document.getElementById("local-time")
};

function getStoredCities() {
    const raw = localStorage.getItem("wm:cities");
    if (!raw) return ["London", "New York", "Mumbai"];
    try { return JSON.parse(raw); } catch { return ["London"]; }
}

function storeCities(cities){
    localStorage.setItem("wm:cities", JSON.stringify(cities));
}

function formatDay(ts){
    return new Date(ts * 1000).toLocaleDateString(undefined, { weekday: "short" });
}

function formatTime(ts){
    return new Date(ts * 1000).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function getWindDirection(degrees) {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(degrees / 22.5) % 16;
    return directions[index];
}

function getWeatherIcon(weatherCode, description) {
    const iconMap = {
        '01d': '☀️', '01n': '🌙',
        '02d': '⛅', '02n': '☁️',
        '03d': '☁️', '03n': '☁️',
        '04d': '☁️', '04n': '☁️',
        '09d': '🌦️', '09n': '🌧️',
        '10d': '🌧️', '10n': '🌧️',
        '11d': '⛈️', '11n': '⛈️',
        '13d': '🌨️', '13n': '🌨️',
        '50d': '🌫️', '50n': '🌫️'
    };
    
    return iconMap[weatherCode] || getWeatherIconByDescription(description);
}

function getWeatherIconByDescription(description) {
    const desc = description.toLowerCase();
    if (desc.includes('rain') || desc.includes('drizzle')) return '🌧️';
    if (desc.includes('snow')) return '🌨️';
    if (desc.includes('thunder') || desc.includes('storm')) return '⛈️';
    if (desc.includes('cloud')) return '☁️';
    if (desc.includes('clear')) return '☀️';
    if (desc.includes('fog') || desc.includes('mist')) return '🌫️';
    if (desc.includes('haze')) return '🌫️';
    if (desc.includes('smoke')) return '💨';
    if (desc.includes('dust') || desc.includes('sand')) return '🌪️';
    if (desc.includes('ash')) return '🌋';
    if (desc.includes('squall')) return '💨';
    if (desc.includes('tornado')) return '🌪️';
    return '🌤️';
}

async function updateLocalTime(city) {
    try {
        const { lat, lon } = await geocodeCity(city);
        const timezoneUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&units=metric&appid=${OPENWEATHER_API_KEY}`;
        const res = await fetch(timezoneUrl);
        if (res.ok) {
            const data = await res.json();
            const cityTime = new Date();
            const timezoneOffset = data.timezone || 0;
            cityTime.setSeconds(cityTime.getSeconds() + timezoneOffset);
            
            const hours = cityTime.getUTCHours().toString().padStart(2, '0');
            const minutes = cityTime.getUTCMinutes().toString().padStart(2, '0');
            els.localTime.textContent = `${hours}:${minutes}`;
            
            setTimeout(() => updateLocalTime(city), 60000);
        }
    } catch (error) {
        const now = new Date();
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        els.localTime.textContent = `${hours}:${minutes}`;
    }
}

async function fetchCurrent(city){
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&units=metric&appid=${OPENWEATHER_API_KEY}`;
    const res = await fetch(url);
    if(!res.ok){
        let msg = res.statusText;
        try { const data = await res.json(); msg = data.message || msg; } catch {}
        throw new Error(msg);
    }
    return res.json();
}

async function fetchForecast(city){
    const url = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&units=metric&appid=${OPENWEATHER_API_KEY}`;
    const res = await fetch(url);
    if(!res.ok){
        let msg = res.statusText;
        try { const data = await res.json(); msg = data.message || msg; } catch {}
        throw new Error(msg);
    }
    const data = await res.json();
    
    const groups = new Map();
    for(const item of data.list){
        const d = new Date(item.dt * 1000);
        const dateKey = d.toISOString().slice(0,10);
        const todayKey = new Date().toISOString().slice(0,10);
        if(dateKey === todayKey) continue;
        if(!groups.has(dateKey)) groups.set(dateKey, []);
        groups.get(dateKey).push(item);
    }
    
    const summaries = [];
    for(const [dateKey, items] of groups){
        let min = Infinity, max = -Infinity;
        const counts = {};
        let chosen = items[0].weather[0];
        
        for(const it of items){
            min = Math.min(min, it.main.temp_min);
            max = Math.max(max, it.main.temp_max);
            const key = it.weather[0].icon + "|" + it.weather[0].main;
            counts[key] = (counts[key]||0)+1;
            if(counts[key] >= (counts[chosen.icon+"|"+chosen.main]||0)){
                chosen = it.weather[0];
            }
        }
        
        const any = items[Math.floor(items.length/2)];
        summaries.push({
            dt: any.dt,
            main: { temp_min: min, temp_max: max },
            weather: [chosen]
        });
        if(summaries.length === 5) break;
    }
    return summaries;
}

async function geocodeCity(city){
    const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(city)}&limit=1&appid=${OPENWEATHER_API_KEY}`;
    const res = await fetch(url);
    if(!res.ok) throw new Error("Geocoding failed");
    const data = await res.json();
    if(!data.length) throw new Error("City not found");
    return { lat: data[0].lat, lon: data[0].lon };
}

async function fetchUVIndex(lat, lon) {
    try {
        const url = `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}`;
        const res = await fetch(url);
        if(res.ok) {
            const data = await res.json();
            return data.list[0]?.main?.aqi || '--';
        }
    } catch {}
    return '--';
}

function renderNowHeader(cityData){
    const now = new Date();
    els.nowDay.textContent = now.toLocaleDateString(undefined,{ weekday:"long", month:"short", day:"numeric"});
    els.nowTemp.textContent = `${Math.round(cityData.main.temp)}°C`;
}

function createLoadingCard(){
    const node = els.cardTpl.content.firstElementChild.cloneNode(true);
    return node;
}

function updateCard(node, city, current){
    node.classList.remove("loading");
    node.querySelector(".city-name").textContent = city;
    
    const tempElement = node.querySelector(".temp");
    if (tempElement) {
        tempElement.textContent = `${Math.round(current.main.temp)}°C`;
    }
    
    const metas = node.querySelectorAll(".meta .value");
    metas[1].textContent = current.weather[0].main;
    metas[2].textContent = `${current.main.humidity}%`;
    metas[3].textContent = `${Math.round(current.wind.speed)} m/s`;
    
    const icon = current.weather[0].icon;
    node.querySelector(".icon").src = `https://openweathermap.org/img/wn/${icon}@2x.png`;
    
    node.addEventListener("click", async (e) => {
        if (e.target.classList.contains('close-btn')) return;
        
        state.selectedCity = city;
        await showCityDetails(city, current);
        renderNowHeader(current);
    });
    
    const closeBtn = node.querySelector(".close-btn");
    if (closeBtn) {
        closeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            removeCity(city, node);
        });
    }
}

async function showCityDetails(city, currentData) {
    els.detailCity.textContent = city;
    
    showTab('current');
    
    els.currentTemp.textContent = Math.round(currentData.main.temp);
    els.weatherDesc.textContent = currentData.weather[0].description;
    els.feelsLike.textContent = Math.round(currentData.main.feels_like);
    els.minMax.textContent = `${Math.round(currentData.main.temp_min)}/${Math.round(currentData.main.temp_max)}`;
    els.humidity.textContent = `${currentData.main.humidity}%`;
    els.wind.textContent = `${Math.round(currentData.wind.speed)} m/s`;
    els.visibility.textContent = `${(currentData.visibility / 1000).toFixed(1)}`;
    els.pressure.textContent = `${currentData.main.pressure}`;
    els.sunrise.textContent = formatTime(currentData.sys.sunrise);
    els.sunset.textContent = formatTime(currentData.sys.sunset);
    
    updateLocalTime(city);
    
    els.windDirection.textContent = getWindDirection(currentData.wind.deg);
    els.windGust.textContent = currentData.wind.gust ? `${Math.round(currentData.wind.gust)} m/s` : '--';
    els.cloudCover.textContent = `${currentData.clouds.all}%`;
    els.rain1h.textContent = currentData.rain ? `${currentData.rain['1h'] || 0} mm` : '0 mm';
    els.snow1h.textContent = currentData.snow ? `${currentData.snow['1h'] || 0} mm` : '0 mm';
    els.dewPoint.textContent = `${Math.round(currentData.main.dew_point)}°C`;
    
    try {
        const { lat, lon } = await geocodeCity(city);
        const uvData = await fetchUVIndex(lat, lon);
        els.uvIndex.textContent = uvData || '--';
    } catch {
        els.uvIndex.textContent = '--';
    }
}

async function renderForecast(city){
    els.forecastList.innerHTML = "";
    const placeholder = document.createElement("div");
    placeholder.textContent = "Loading forecast...";
    placeholder.className = "forecast-item";
    els.forecastList.appendChild(placeholder);
    
    try{
        const items = await fetchForecast(city);
        els.forecastList.innerHTML = "";
        
        items.forEach(item => {
            const forecastItem = document.createElement("div");
            forecastItem.className = "forecast-item";
            
            const day = document.createElement("div");
            day.className = "day";
            day.textContent = formatDay(item.dt);
            
            const weather = document.createElement("div");
            weather.className = "weather";
            const icon = item.weather[0].icon;
            weather.innerHTML = `<img alt="" src="https://openweathermap.org/img/wn/${icon}.png"> ${item.weather[0].main}`;
            
            const temps = document.createElement("div");
            temps.className = "temps";
            temps.textContent = `${Math.round(item.main.temp_min)}° / ${Math.round(item.main.temp_max)}°`;
            
            forecastItem.append(day, weather, temps);
            els.forecastList.appendChild(forecastItem);
        });
    }catch(err){
        els.forecastList.innerHTML = "<div class='forecast-item'>Forecast unavailable</div>";
    }
}

function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.add('hidden');
    });
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    document.getElementById(`${tabName}-tab`).classList.remove('hidden');
    
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    if(tabName === 'forecast' && state.selectedCity) {
        renderForecast(state.selectedCity);
    }
}

function wireEvents(){
    els.searchBtn.addEventListener("click", onSearch);
    els.searchInput.addEventListener("keydown", (e)=>{ if(e.key === "Enter") onSearch(); });
    els.locationBtn.addEventListener("click", addUserLocation);
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            showTab(btn.dataset.tab);
        });
    });
}

function onSearch(){
    const city = els.searchInput.value.trim();
    if(!city) return;
    addCity(city);
    els.searchInput.value = "";
}

async function addCity(city){
    const card = createLoadingCard();
    els.cards.prepend(card);
    try{
        const current = await fetchCurrent(city);
        updateCard(card, city, current);
        if(!state.cities.includes(city)){
            state.cities.push(city);
            storeCities(state.cities);
        }
        if(!state.selectedCity){
            state.selectedCity = city;
            await showCityDetails(city, current);
            renderNowHeader(current);
        }
    }catch(err){
        card.remove();
        alert(err.message);
    }
}

async function addUserLocation() {
    if (!navigator.geolocation) {
        console.warn("Geolocation is not supported by your browser.");
        return;
    }
    
    try {
        const loadingCard = createLoadingCard();
        loadingCard.querySelector(".city-name").textContent = "Detecting location...";
        els.cards.prepend(loadingCard);
        
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 600000
            });
        });
        
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        
        const cityName = await reverseGeocode(lat, lon);
        
        loadingCard.remove();
        
        if (cityName) {
            await addCity(cityName);
            console.log(`Location detected: ${cityName}`);
        } else {
            console.warn(`Could not find city for coordinates: ${lat}, ${lon}`);
        }
        
    } catch (error) {
        console.error("Error getting user location:", error);
        const loadingCard = els.cards.querySelector(".card.loading");
        if (loadingCard) loadingCard.remove();
    }
}

async function reverseGeocode(lat, lon) {
    try {
        const url = `https://api.openweathermap.org/geo/1.0/reverse?lat=${lat}&lon=${lon}&limit=1&appid=${OPENWEATHER_API_KEY}`;
        const res = await fetch(url);
        if (!res.ok) {
            let msg = res.statusText;
            try { const data = await res.json(); msg = data.message || msg; } catch {}
            throw new Error(`Reverse geocoding failed: ${msg}`);
        }
        const data = await res.json();
        if (!data.length) {
            return null;
        }
        return data[0].name;
    } catch (error) {
        console.error("Reverse geocoding error:", error);
        return null;
    }
}

function removeCity(city, cardNode) {
    const cityIndex = state.cities.indexOf(city);
    if (cityIndex > -1) {
        state.cities.splice(cityIndex, 1);
        storeCities(state.cities);
    }
    
    cardNode.remove();
    
    if (state.selectedCity === city) {
        state.selectedCity = null;
        els.detailCity.textContent = "Select a City";
        els.currentTemp.textContent = "--";
        els.weatherDesc.textContent = "--";
        els.feelsLike.textContent = "--";
        els.minMax.textContent = "--/--";
        els.humidity.textContent = "--%";
        els.wind.textContent = "-- m/s";
        els.visibility.textContent = "--";
        els.pressure.textContent = "--";
        els.sunrise.textContent = "--:--";
        els.sunset.textContent = "--:--";
        els.localTime.textContent = "--:--";
        els.windDirection.textContent = "--";
        els.windGust.textContent = "-- m/s";
        els.cloudCover.textContent = "--%";
        els.rain1h.textContent = "-- mm";
        els.snow1h.textContent = "-- mm";
        els.dewPoint.textContent = "--°C";
        els.uvIndex.textContent = "--";
    }
}

async function init(){
    wireEvents();
    state.cities = getStoredCities();
    
    await addUserLocation();
    
    for(const city of state.cities){
        addCity(city);
    }
}

init();


