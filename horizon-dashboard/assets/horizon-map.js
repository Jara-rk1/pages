// ================================================================
// HORIZON BD Opportunity Engine — Leaflet Map Module
// Interactive map of Australia with KPMG offices + opportunity markers
// ================================================================

var KPMG_OFFICES = [
    // Major Capital City Offices
    { name: 'Sydney', lat: -33.8688, lng: 151.2093 },
    { name: 'Melbourne', lat: -37.8136, lng: 144.9631 },
    { name: 'Brisbane', lat: -27.4698, lng: 153.0251 },
    { name: 'Perth', lat: -31.9505, lng: 115.8605 },
    { name: 'Adelaide', lat: -34.9285, lng: 138.6007 },
    { name: 'Hobart', lat: -42.8821, lng: 147.3272 },
    { name: 'Canberra', lat: -35.2809, lng: 149.1300 },
    { name: 'Darwin', lat: -12.4634, lng: 130.8456 },
    // Regional & Secondary Offices
    { name: 'Parramatta', lat: -33.8151, lng: 151.0011 },
    { name: 'Gold Coast', lat: -28.0167, lng: 153.4000 },
    { name: 'Townsville', lat: -19.2590, lng: 146.8169 },
    { name: 'Wollongong', lat: -34.4278, lng: 150.8931 },
    { name: 'Geelong', lat: -38.1499, lng: 144.3617 },
    { name: 'Newcastle', lat: -32.9283, lng: 151.7817 },
    { name: 'Cairns', lat: -16.9186, lng: 145.7781 },
    { name: 'Karratha', lat: -20.7377, lng: 116.8463 },
    { name: 'Mount Isa', lat: -20.7256, lng: 139.4927 },
    { name: 'Albury', lat: -36.0737, lng: 146.9135 },
    { name: 'Launceston', lat: -41.4332, lng: 147.1441 },
    { name: 'Bendigo', lat: -36.7570, lng: 144.2794 },
    { name: 'Toowoomba', lat: -27.5598, lng: 151.9507 }
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
        maxBounds: L.latLngBounds(
            L.latLng(-47.0, 108.0),
            L.latLng(-8.0, 160.0)
        ),
        maxBoundsViscosity: 0.85
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 18
    }).addTo(APP.map);

    // Add KPMG office markers
    KPMG_OFFICES.forEach(function(office) {
        var icon = L.divIcon({
            className: 'kpmg-office-marker',
            iconSize: [10, 10],
            iconAnchor: [5, 5]
        });
        L.marker([office.lat, office.lng], { icon: icon })
            .bindPopup('<strong>KPMG ' + escapeHtml(office.name) + '</strong>')
            .addTo(APP.map);
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
