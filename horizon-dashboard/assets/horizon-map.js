// ================================================================
// HORIZON BD Opportunity Engine — Leaflet Map Module
// Interactive map of Australia with KPMG offices + opportunity markers
// ================================================================

var KPMG_OFFICES = [
    // Major Capital City Offices
    { name: 'Sydney', lat: -33.8651, lng: 151.2021 },       // Tower Three, International Towers, 300 Barangaroo Ave
    { name: 'Melbourne', lat: -37.8212, lng: 144.9496 },     // Tower Two, Collins Square, 727 Collins St
    { name: 'Brisbane', lat: -27.4679, lng: 153.0256 },      // Level 11, Heritage Lanes, 80 Ann St
    { name: 'Perth', lat: -31.9535, lng: 115.8605 },         // 235 St Georges Terrace
    { name: 'Adelaide', lat: -34.9249, lng: 138.6100 },      // 151 Pirie St
    { name: 'Hobart', lat: -42.8822, lng: 147.3223 },        // Level 3, 100 Melville St
    { name: 'Canberra', lat: -35.2975, lng: 149.1300 },      // Level 9, Constitution Place, 1 Constitution Ave
    { name: 'Darwin', lat: -12.4634, lng: 130.8456 },        // 18 Smith St
    // Regional & Secondary Offices
    { name: 'Parramatta', lat: -33.8165, lng: 151.0034 },    // Level 16, 3 Parramatta Square, 153 Macquarie St
    { name: 'Gold Coast', lat: -28.0127, lng: 153.4150 },    // Level 11, Corporate Centre One, Bundall
    { name: 'Townsville', lat: -19.2590, lng: 146.7810 },    // Level 10, 61-73 Sturt St
    { name: 'Wollongong', lat: -34.4268, lng: 150.8931 },    // Level 7, 77 Market St
    { name: 'Geelong', lat: -38.1467, lng: 144.3570 },       // 60 Moorabool St
    { name: 'Newcastle', lat: -32.9267, lng: 151.7700 }      // Level 3, 18 Honeysuckle Dr
];

var JURISDICTION_COORDS = {
    'QLD': { lat: -22.5, lng: 144.0 },
    'NSW': { lat: -32.0, lng: 147.0 },
    'VIC': { lat: -37.0, lng: 144.5 },
    'SA': { lat: -30.0, lng: 136.0 },
    'WA': { lat: -25.0, lng: 122.0 },
    'TAS': { lat: -42.0, lng: 146.5 },
    'NT': { lat: -19.5, lng: 133.5 },
    'ACT': { lat: -35.3, lng: 149.1 },
    'Commonwealth': { lat: -35.3, lng: 149.1 },
    'National': { lat: -28.0, lng: 134.0 }
};

function initMap() {
    var container = document.getElementById('map-container');
    if (!container) return;

    if (APP.map) {
        // Map already exists — just update markers and fix size
        onPipelinePageVisible();
        updateMapMarkers(APP.opportunities || []);
        return;
    }

    APP.map = L.map('map-container', {
        center: [-28.0, 134.0],
        zoom: 4,
        zoomControl: false,
        maxBounds: L.latLngBounds(
            L.latLng(-47.0, 108.0),
            L.latLng(-8.0, 160.0)
        ),
        maxBoundsViscosity: 0.85
    });

    L.control.zoom({ position: 'bottomleft' }).addTo(APP.map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 18
    }).addTo(APP.map);

    // Add KPMG office markers
    KPMG_OFFICES.forEach(function(office) {
        var icon = L.divIcon({
            className: 'kpmg-office-marker',
            html: '<span role="img" aria-label="KPMG ' + escapeHtml(office.name) + ' office"></span>',
            iconSize: [10, 10],
            iconAnchor: [5, 5]
        });
        var marker = L.marker([office.lat, office.lng], { icon: icon })
            .bindPopup('<strong>KPMG ' + escapeHtml(office.name) + '</strong>')
            .addTo(APP.map);
        // Leaflet divIcon creates a <div role="button"> — add aria-label for a11y
        var el = marker.getElement();
        if (el) el.setAttribute('aria-label', 'KPMG ' + office.name + ' office');
    });

    // Create layer group for opportunity markers
    APP.mapMarkers = L.layerGroup().addTo(APP.map);

    // Add legend overlay
    _addMapLegend();

    // Initial markers
    updateMapMarkers(APP.opportunities || []);
}

function _addMapLegend() {
    var mapEl = document.getElementById('map-container');
    if (!mapEl || mapEl.querySelector('.map-legend')) return;

    var legend = document.createElement('div');
    legend.className = 'map-legend';
    legend.innerHTML =
        '<div class="map-legend__title">Key</div>' +
        '<div class="map-legend__item"><span class="map-legend__dot map-legend__dot--office"></span> KPMG Office (' + KPMG_OFFICES.length + ')</div>' +
        '<div class="map-legend__item"><span class="map-legend__dot map-legend__dot--hot"></span> Hot (&ge;80)</div>' +
        '<div class="map-legend__item"><span class="map-legend__dot map-legend__dot--warm"></span> Warm (&ge;60)</div>' +
        '<div class="map-legend__item"><span class="map-legend__dot map-legend__dot--watch"></span> Watch (&ge;40)</div>' +
        '<div class="map-legend__item"><span class="map-legend__dot map-legend__dot--cold"></span> Cold (&lt;40)</div>';
    mapEl.appendChild(legend);
}

function updateMapMarkers(opportunities) {
    if (!APP.map) return;

    if (!APP.mapMarkers) {
        APP.mapMarkers = L.layerGroup().addTo(APP.map);
    } else {
        APP.mapMarkers.clearLayers();
    }

    if (!opportunities || opportunities.length === 0) return;

    // Group by jurisdiction
    var byJurisdiction = {};
    opportunities.forEach(function(opp) {
        var juris = opp.jurisdiction || 'National';
        if (!byJurisdiction[juris]) {
            byJurisdiction[juris] = [];
        }
        byJurisdiction[juris].push(opp);
    });

    Object.keys(byJurisdiction).forEach(function(juris) {
        var coords = JURISDICTION_COORDS[juris];
        if (!coords) return;

        var group = byJurisdiction[juris];
        var count = group.length;

        // Determine colour from highest-scoring opportunity
        var maxScore = group.reduce(function(max, opp) {
            var score = opp.composite_score || 0;
            return score > max ? score : max;
        }, 0);

        var fillColor;
        if (maxScore >= 80) fillColor = '#7213EA';
        else if (maxScore >= 60) fillColor = '#1E49E2';
        else if (maxScore >= 40) fillColor = '#00B8F5';
        else fillColor = '#666666';

        var radius = Math.max(8, Math.min(20, count * 3));

        // Sort by score desc, take top 3 for popup
        var sorted = group.slice().sort(function(a, b) {
            return (b.composite_score || 0) - (a.composite_score || 0);
        });
        var top3 = sorted.slice(0, 3);

        var oppListHtml = top3.map(function(opp) {
            var id = escapeHtml(String(opp.id || ''));
            var title = escapeHtml(opp.title || 'Untitled');
            var score = (opp.composite_score || 0);
            return '<div style="margin:4px 0;">'
                + '<a href="#opportunity/' + id + '" '
                + 'onclick="event.preventDefault();location.hash=\'#opportunity/' + id + '\';" '
                + 'style="color:#00338D;text-decoration:underline;cursor:pointer;">'
                + title + '</a>'
                + ' <span style="color:#666666;font-size:11px;">(' + score.toFixed(1) + ')</span>'
                + '</div>';
        }).join('');

        if (count > 3) {
            oppListHtml += '<div style="color:#666666;font-size:11px;margin-top:4px;">+'
                + (count - 3) + ' more</div>';
        }

        var popupHtml = '<div style="min-width:180px;">'
            + '<strong style="color:#00338D;">' + escapeHtml(juris) + '</strong>'
            + '<div style="font-size:12px;color:#666666;margin-bottom:6px;">'
            + count + ' opportunit' + (count === 1 ? 'y' : 'ies') + '</div>'
            + oppListHtml
            + '</div>';

        L.circleMarker([coords.lat, coords.lng], {
            radius: radius,
            fillColor: fillColor,
            fillOpacity: 0.7,
            color: '#FFFFFF',
            weight: 2
        })
        .bindPopup(popupHtml, { maxWidth: 260 })
        .addTo(APP.mapMarkers);
    });
}

function onPipelinePageVisible() {
    if (APP.map) {
        setTimeout(function() {
            APP.map.invalidateSize();
        }, 100);
    }
}
