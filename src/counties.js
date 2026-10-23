// -----------------------------------------------------------------------------
// The 26 counties Met Éireann issues warnings for, and the county of a house.
//
// Each warning lists its counties by code (`regions`: EI01 … EI31). The codes
// are the FIPS 10-4 codes of the counties of Ireland, which MeteoAlarm uses as
// EMMA_ID: checked against the live warnings of 2026-10-23 (Storm Boelo,
// test/fixtures/real-warnings-ireland.json), whose headlines name their
// counties ("Rain warning for Kerry": EI11).
//
// Gladys gives a house coordinates, not a county. The county is the one of
// the nearest of about 200 towns and villages below, spread over every
// county and along the borders; farther than 40 km from all of them, the
// house is outside Ireland and has no county. Northern Ireland towns are in
// the list too, as "no county": Met Éireann does not issue warnings there
// (the Met Office does). Near a county border the guess can be wrong: the
// `county` setting then fixes it (config.js).
// -----------------------------------------------------------------------------

const MAX_DISTANCE_KM = 40;

const COUNTIES = Object.freeze({
  EI01: 'Carlow',
  EI02: 'Cavan',
  EI03: 'Clare',
  EI04: 'Cork',
  EI06: 'Donegal',
  EI07: 'Dublin',
  EI10: 'Galway',
  EI11: 'Kerry',
  EI12: 'Kildare',
  EI13: 'Kilkenny',
  EI14: 'Leitrim',
  EI15: 'Laois',
  EI16: 'Limerick',
  EI18: 'Longford',
  EI19: 'Louth',
  EI20: 'Mayo',
  EI21: 'Meath',
  EI22: 'Monaghan',
  EI23: 'Offaly',
  EI24: 'Roscommon',
  EI25: 'Sligo',
  EI26: 'Tipperary',
  EI27: 'Waterford',
  EI29: 'Westmeath',
  EI30: 'Wexford',
  EI31: 'Wicklow',
});

// [code (null: Northern Ireland), latitude, longitude] of towns and villages.
const TOWNS = Object.freeze([
  ['EI01', 52.836, -6.926], // Carlow
  ['EI01', 52.8, -6.737], // Tullow
  ['EI01', 52.7, -6.958], // Bagenalstown
  ['EI01', 52.6, -6.89], // Borris
  ['EI02', 53.991, -7.36], // Cavan
  ['EI02', 53.913, -6.968], // Bailieborough
  ['EI02', 54.102, -7.448], // Belturbet
  ['EI02', 54.291, -7.877], // Blacklion
  ['EI02', 53.834, -7.078], // Virginia
  ['EI02', 53.865, -7.29], // Ballyjamesduff
  ['EI02', 54.08, -7.73], // Ballyconnell
  ['EI03', 52.843, -8.986], // Ennis
  ['EI03', 52.64, -9.483], // Kilrush
  ['EI03', 53.03, -9.29], // Lisdoonvarna
  ['EI03', 52.909, -8.53], // Scarriff
  ['EI03', 52.703, -8.864], // Shannon
  ['EI03', 52.682, -9.645], // Kilkee
  ['EI03', 52.94, -9.35], // Lahinch
  ['EI03', 52.71, -8.62], // Killaloe side (Ballina)
  ['EI04', 51.898, -8.476], // Cork
  ['EI04', 52.139, -8.645], // Mallow
  ['EI04', 51.68, -9.453], // Bantry
  ['EI04', 51.55, -9.262], // Skibbereen
  ['EI04', 51.953, -7.85], // Youghal
  ['EI04', 51.904, -8.957], // Macroom
  ['EI04', 51.623, -8.87], // Clonakilty
  ['EI04', 52.138, -8.276], // Fermoy
  ['EI04', 52.356, -8.683], // Charleville
  ['EI04', 51.651, -9.91], // Castletownbere
  ['EI04', 52.172, -8.905], // Kanturk
  ['EI04', 52.06, -9.067], // Millstreet
  ['EI04', 51.706, -8.522], // Kinsale
  ['EI04', 52.25, -8.25], // Kildorrery
  ['EI06', 54.95, -7.734], // Letterkenny
  ['EI06', 54.654, -8.11], // Donegal
  ['EI06', 55.133, -7.453], // Buncrana
  ['EI06', 54.951, -8.36], // Dungloe
  ['EI06', 54.503, -8.189], // Ballyshannon
  ['EI06', 54.635, -8.448], // Killybegs
  ['EI06', 55.25, -7.263], // Carndonagh
  ['EI06', 55.136, -8.106], // Falcarragh
  ['EI06', 54.795, -8.283], // Glenties
  ['EI06', 54.834, -7.484], // Lifford
  ['EI06', 54.67, -7.62], // Ballybofey
  ['EI06', 54.98, -7.43], // Bridgend
  ['EI07', 53.35, -6.26], // Dublin
  ['EI07', 53.46, -6.218], // Swords
  ['EI07', 53.288, -6.373], // Tallaght
  ['EI07', 53.294, -6.134], // Dún Laoghaire
  ['EI07', 53.612, -6.182], // Balbriggan
  ['EI07', 53.357, -6.449], // Lucan
  ['EI07', 53.582, -6.108], // Skerries
  ['EI07', 53.39, -6.07], // Howth
  ['EI10', 53.271, -9.057], // Galway
  ['EI10', 53.515, -8.851], // Tuam
  ['EI10', 53.328, -8.22], // Ballinasloe
  ['EI10', 53.489, -10.019], // Clifden
  ['EI10', 53.197, -8.567], // Loughrea
  ['EI10', 53.065, -8.817], // Gort
  ['EI10', 53.09, -8.218], // Portumna
  ['EI10', 53.428, -9.32], // Oughterard
  ['EI10', 53.606, -8.583], // Glenamaddy
  ['EI10', 53.12, -9.72], // Inis Mór
  ['EI10', 53.244, -9.305], // An Spidéal
  ['EI10', 53.32, -9.83], // Carna
  ['EI10', 53.6, -9.7], // Leenaun
  ['EI10', 53.18, -8.9], // Kinvara area
  ['EI11', 52.271, -9.7], // Tralee
  ['EI11', 52.059, -9.504], // Killarney
  ['EI11', 51.88, -9.583], // Kenmare
  ['EI11', 52.141, -10.269], // Dingle
  ['EI11', 52.446, -9.485], // Listowel
  ['EI11', 51.948, -10.222], // Cahersiveen
  ['EI11', 52.233, -9.461], // Castleisland
  ['EI11', 51.837, -9.9], // Sneem
  ['EI11', 52.55, -9.5], // Ballylongford
  ['EI12', 53.216, -6.666], // Naas
  ['EI12', 53.182, -6.797], // Newbridge
  ['EI12', 52.991, -6.987], // Athy
  ['EI12', 53.381, -6.592], // Maynooth
  ['EI12', 53.157, -6.911], // Kildare
  ['EI12', 53.4, -6.67], // Kilcock
  ['EI12', 53.35, -6.95], // Carbury
  ['EI13', 52.654, -7.244], // Kilkenny
  ['EI13', 52.526, -7.137], // Thomastown
  ['EI13', 52.806, -7.211], // Castlecomer
  ['EI13', 52.544, -7.389], // Callan
  ['EI13', 52.721, -7.582], // Urlingford
  ['EI13', 52.29, -7.249], // Mooncoin
  ['EI13', 52.42, -6.95], // Graiguenamanagh
  ['EI14', 53.947, -8.09], // Carrick-on-Shannon
  ['EI14', 54.306, -8.177], // Manorhamilton
  ['EI14', 53.922, -7.865], // Mohill
  ['EI14', 54.052, -7.802], // Ballinamore
  ['EI14', 54.45, -8.284], // Kinlough
  ['EI14', 54.048, -8.04], // Drumshanbo
  ['EI15', 53.034, -7.3], // Portlaoise
  ['EI15', 53.162, -7.191], // Portarlington
  ['EI15', 53.113, -7.32], // Mountmellick
  ['EI15', 52.915, -7.348], // Abbeyleix
  ['EI15', 52.855, -7.583], // Rathdowney
  ['EI15', 52.999, -7.474], // Mountrath
  ['EI15', 52.98, -7.1], // Stradbally
  ['EI16', 52.664, -8.627], // Limerick
  ['EI16', 52.449, -9.061], // Newcastle West
  ['EI16', 52.4, -8.578], // Kilmallock
  ['EI16', 52.385, -9.301], // Abbeyfeale
  ['EI16', 52.523, -8.938], // Rathkeale
  ['EI16', 52.519, -8.718], // Croom
  ['EI16', 52.57, -9.283], // Glin
  ['EI16', 52.6, -8.4], // Cappamore
  ['EI18', 53.727, -7.798], // Longford
  ['EI18', 53.778, -7.494], // Granard
  ['EI18', 53.565, -7.765], // Ballymahon
  ['EI18', 53.672, -7.99], // Lanesborough
  ['EI19', 54.0, -6.405], // Dundalk
  ['EI19', 53.718, -6.348], // Drogheda
  ['EI19', 53.858, -6.539], // Ardee
  ['EI19', 54.041, -6.187], // Carlingford
  ['EI19', 53.832, -6.394], // Dunleer
  ['EI20', 53.856, -9.298], // Castlebar
  ['EI20', 54.115, -9.155], // Ballina
  ['EI20', 53.8, -9.522], // Westport
  ['EI20', 54.224, -9.99], // Belmullet
  ['EI20', 53.633, -9.229], // Ballinrobe
  ['EI20', 53.721, -8.998], // Claremorris
  ['EI20', 53.944, -8.95], // Swinford
  ['EI20', 53.762, -8.765], // Ballyhaunis
  ['EI20', 53.973, -10.08], // Keel, Achill
  ['EI20', 54.1, -9.316], // Crossmolina
  ['EI20', 54.3, -9.6], // Ballycastle
  ['EI20', 53.6, -9.9], // Louisburgh area
  ['EI21', 53.652, -6.681], // Navan
  ['EI21', 53.555, -6.792], // Trim
  ['EI21', 53.726, -6.879], // Kells
  ['EI21', 53.511, -6.397], // Ashbourne
  ['EI21', 53.419, -6.474], // Dunboyne
  ['EI21', 53.77, -7.163], // Oldcastle
  ['EI21', 53.68, -6.24], // Laytown
  ['EI21', 53.623, -6.917], // Athboy
  ['EI21', 53.45, -6.85], // Enfield
  ['EI22', 54.249, -6.968], // Monaghan
  ['EI22', 53.977, -6.719], // Carrickmacross
  ['EI22', 54.119, -6.737], // Castleblayney
  ['EI22', 54.18, -7.231], // Clones
  ['EI22', 54.128, -6.9], // Ballybay
  ['EI22', 54.32, -6.97], // Emyvale
  ['EI23', 53.274, -7.488], // Tullamore
  ['EI23', 53.091, -7.912], // Birr
  ['EI23', 53.345, -7.049], // Edenderry
  ['EI23', 53.188, -7.987], // Banagher
  ['EI23', 53.343, -7.613], // Clara
  ['EI23', 53.27, -7.828], // Ferbane
  ['EI23', 53.15, -7.3], // Killeigh area
  ['EI24', 53.632, -8.19], // Roscommon
  ['EI24', 53.973, -8.299], // Boyle
  ['EI24', 53.768, -8.49], // Castlerea
  ['EI24', 53.776, -8.103], // Strokestown
  ['EI24', 53.901, -8.578], // Ballaghaderreen
  ['EI24', 53.43, -8.02], // Monksland
  ['EI24', 53.5, -8.2], // Knockcroghery
  ['EI25', 54.277, -8.476], // Sligo
  ['EI25', 54.056, -8.729], // Tubbercurry
  ['EI25', 54.089, -8.517], // Ballymote
  ['EI25', 54.215, -9.096], // Enniscrone
  ['EI25', 54.398, -8.523], // Grange
  ['EI26', 52.355, -7.704], // Clonmel
  ['EI26', 52.862, -8.196], // Nenagh
  ['EI26', 52.68, -7.814], // Thurles
  ['EI26', 52.474, -8.155], // Tipperary
  ['EI26', 52.516, -7.886], // Cashel
  ['EI26', 52.951, -7.801], // Roscrea
  ['EI26', 52.349, -7.413], // Carrick-on-Suir
  ['EI26', 52.375, -7.925], // Cahir
  ['EI26', 53.0, -8.13], // Borrisokane
  ['EI26', 52.795, -7.833], // Templemore
  ['EI26', 52.6, -7.55], // Killenaule
  ['EI27', 52.259, -7.11], // Waterford
  ['EI27', 52.088, -7.626], // Dungarvan
  ['EI27', 52.137, -7.931], // Lismore
  ['EI27', 52.162, -7.152], // Tramore
  ['EI27', 52.15, -6.993], // Dunmore East
  ['EI27', 51.95, -7.725], // Ardmore
  ['EI27', 52.2, -7.4], // Kilmacthomas
  ['EI29', 53.526, -7.338], // Mullingar
  ['EI29', 53.423, -7.94], // Athlone
  ['EI29', 53.398, -7.723], // Moate
  ['EI29', 53.458, -7.103], // Kinnegad
  ['EI29', 53.68, -7.297], // Castlepollard
  ['EI29', 53.369, -7.502], // Kilbeggan
  ['EI30', 52.334, -6.458], // Wexford
  ['EI30', 52.501, -6.558], // Enniscorthy
  ['EI30', 52.675, -6.293], // Gorey
  ['EI30', 52.397, -6.936], // New Ross
  ['EI30', 52.255, -6.335], // Rosslare
  ['EI30', 52.655, -6.651], // Bunclody
  ['EI30', 52.197, -6.84], // Fethard-on-Sea
  ['EI31', 52.98, -6.045], // Wicklow
  ['EI31', 53.203, -6.098], // Bray
  ['EI31', 52.797, -6.16], // Arklow
  ['EI31', 53.17, -6.533], // Blessington
  ['EI31', 52.941, -6.709], // Baltinglass
  ['EI31', 53.01, -6.33], // Glendalough
  ['EI31', 52.929, -6.231], // Rathdrum
  ['EI31', 52.797, -6.463], // Tinahely
  [null, 54.597, -5.93], // Belfast
  [null, 54.997, -7.309], // Derry
  [null, 54.176, -6.338], // Newry
  [null, 54.344, -7.632], // Enniskillen
  [null, 54.6, -7.3], // Omagh
  [null, 54.35, -6.652], // Armagh
  [null, 54.863, -6.276], // Ballymena
  [null, 55.133, -6.668], // Coleraine
  [null, 54.503, -6.767], // Dungannon
  [null, 54.827, -7.463], // Strabane
  [null, 54.25, -7.443], // Lisnaskea
  [null, 54.328, -5.715], // Downpatrick
  [null, 54.858, -5.823], // Larne
  [null, 54.478, -8.094], // Belleek
  [null, 54.296, -7.872], // Belcoo
  [null, 54.075, -6.61], // Crossmaglen
  [null, 54.253, -6.7], // Keady
  [null, 54.708, -7.596], // Castlederg
  [null, 54.413, -6.977], // Aughnacloy
  [null, 54.24, -7.17], // Rosslea
  [null, 54.38, -7.31], // Fivemiletown
]);

/**
 * @description The distance between two points, in km (haversine).
 * @param {number} lat1 - Degrees.
 * @param {number} lon1 - Degrees.
 * @param {number} lat2 - Degrees.
 * @param {number} lon2 - Degrees.
 * @returns {number} Kilometres.
 * @example
 * distanceKm(53.35, -6.26, 51.9, -8.48); // -> about 220
 */
function distanceKm(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * @description The county of a location: the one of the nearest town.
 * @param {number} latitude - Degrees.
 * @param {number} longitude - Degrees.
 * @returns {string|null} The county code (EI07…), or null outside the
 * Republic of Ireland.
 * @example
 * countyOf(53.3498, -6.2603); // -> 'EI07'
 */
function countyOf(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  let best = null;
  let bestKm = Infinity;
  for (const [code, lat, lon] of TOWNS) {
    const km = distanceKm(latitude, longitude, lat, lon);
    if (km < bestKm) {
      best = code;
      bestKm = km;
    }
  }
  return bestKm <= MAX_DISTANCE_KM ? best : null;
}

/**
 * @description The county of a house: the setting when one is chosen, else
 * the guess from its coordinates.
 * @param {string} setting - The `county` setting ('auto' or a code).
 * @param {number} latitude - Degrees.
 * @param {number} longitude - Degrees.
 * @returns {string|null} The county code, or null.
 * @example
 * resolveCounty('auto', 51.8985, -8.4756); // -> 'EI04'
 */
function resolveCounty(setting, latitude, longitude) {
  return Object.hasOwn(COUNTIES, setting) ? setting : countyOf(latitude, longitude);
}

export { COUNTIES, MAX_DISTANCE_KM, TOWNS, countyOf, distanceKm, resolveCounty };
