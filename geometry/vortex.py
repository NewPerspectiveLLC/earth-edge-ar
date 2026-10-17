"""Vortex wedge generator + numeric table (spec v1.0). Usage: python3 geometry/vortex.py  -> geometry/vortex-table.json"""
import json, os, sys, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sphere as S
VORTICES = [  # id, name, lat, lon, colour, source
    ('vxRA', 'Ready Athletics Vortex', 48.11035, -122.80591, '#ffc800', 'index.html TARGETS / daynight.js SITES / figures-registry READY_ATHLETICS'),
    ('vxCappy', "Cappy's (Happy's) Trails Vortex pillar", 48.13165, -122.79921, '#30ff60', 'index.html TARGETS / figures-registry CAPPYS'),
    ('vxGarden', "Matt's Meditation Garden vortex (Happy's Trails Vortex music source)", 48.1316475, -122.7992293, '#c080ff', 'index.html GARDEN / audio.js SRC / figures-registry GARDEN'),
]
K = 12; STEP = 30.0; B0 = 0.0; FILL_R = 300.0; GROUND_KM = 110; HUB_M = 180
WEDGE_COLS = ['#ff3b30', '#ff9500', '#ffcc00', '#9be22d', '#34c759', '#00c7be', '#30b0ff', '#007aff', '#5856d6', '#af52de', '#ff2d92', '#ff6482']
def table():
    out = []
    for vid, name, la, lo, col, src in VORTICES:
        v = S.ll2v(la, lo); E, N, U = S.enu_basis(la, lo); aa, ao = S.antipode(la, lo)
        circles = []
        for k in range(6):
            th = k * STEP; n = S.gc_normal(la, lo, th); nl, nlo = S.v2ll(n)
            circles.append({'k': k, 'bearings_deg': [th, th + 180], 'normal': [round(float(x), 9) for x in n], 'pole_latlon': [round(float(nl), 6), round(float(nlo), 6)],
                            'inclination_deg': round(float(np.degrees(np.arccos(abs(n[2])))), 6)})
        wedges = [{'k': k, 'bearing_from': k * STEP, 'bearing_to': (k + 1) * STEP, 'color': WEDGE_COLS[k], 'test': f'p.n({k*30}) < 0 and p.n({(k+1)*30}) > 0, n(theta)=v x d_theta, n(theta+180)=-n(theta)'} for k in range(K)]
        out.append({'id': vid, 'name': name, 'lat': la, 'lon': lo, 'color': col, 'source': src, 'v': [round(float(x), 12) for x in v],
                    'E': [round(float(x), 12) for x in E], 'N': [round(float(x), 12) for x in N], 'antipode_latlon': [aa, ao], 'antipode_v': [round(float(-x), 12) for x in v],
                    'great_circles': circles, 'wedges': wedges, 'fill_radius_m': FILL_R, 'ground_halfline_km': GROUND_KM, 'hub_m': HUB_M})
    return out
if __name__ == '__main__':
    T = table(); G = os.path.dirname(os.path.abspath(__file__))
    # self-checks: every circle passes through v and -v; adjacent wedges sign tests agree with bearing index
    for t in T:
        for c in t['great_circles']:
            n = np.array(c['normal']); assert abs(n @ np.array(t['v'])) < 1e-9
        rng = np.random.default_rng(1); la = t['lat'] + rng.uniform(-60, 40, 2000); lo = t['lon'] + rng.uniform(-170, 170, 2000); la = np.clip(la, -89, 89)
        P = S.ll2v(la, lo); wi = S.wedge_index(t['lat'], t['lon'], la, lo)
        for k in range(12): assert np.all(S.in_lune(P[wi == k], t['lat'], t['lon'], 30 * k, 30 * k + 30))
    # pairwise separation of the vortex centres
    sep = {f'{a["id"]}-{b["id"]}': {'m': round(float(S.haversine(a['lat'], a['lon'], b['lat'], b['lon'])), 2), 'bearing': round(float(S.bearing(a['lat'], a['lon'], b['lat'], b['lon'])), 3)} for i, a in enumerate(T) for b in T[i + 1:]}
    json.dump({'spec': 'Live Geometry vortex table v1.0 (2026-10-17, locked)', 'R_m': S.R, 'k': K, 'step_deg': STEP, 'b0_deg': B0, 'vortices': T, 'separations': sep}, open(os.path.join(G, 'vortex-table.json'), 'w'), indent=1)
    for t in T:
        print(t['id'], t['lat'], t['lon'], 'antipode', t['antipode_latlon'])
        for c in t['great_circles']: print('  k', c['k'], c['bearings_deg'], 'n=', c['normal'], 'pole', c['pole_latlon'])
    print(sep)
