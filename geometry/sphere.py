"""Live Geometry - locked sphere equations (spec v1.0, 2026-10-17). Pure numpy, no I/O.
Earth = sphere of radius R centred at the origin. ECEF-like frame: +X -> (lat 0, lon 0), +Y -> (lat 0, lon 90E), +Z -> North Pole.
Angles in degrees at the API, radians inside. Bearings clockwise from true north. Matches the app (index.html / quest.html / extras.js)."""
import numpy as np
R = 6371000.0            # metres - the radius every renderer in the app uses (index.html, quest.html, extras.js: R=6371e3)
R_LABEL = 6371008.8      # IUGG mean radius used by some distance read-outs (quest.html hav, extras.js RE) - 1.4 ppm different
M_PER_DEG_FLAT = 111320.0  # flat-earth metres/degree used by the local layer + figures (index.html mPer, figures-registry offsetLL)
D = np.pi / 180

def ll2v(lat, lon):
    """unit vector v(lat,lon) = (cos phi cos lam, cos phi sin lam, sin phi)"""
    p, l = np.radians(lat), np.radians(lon)
    return np.stack([np.cos(p) * np.cos(l), np.cos(p) * np.sin(l), np.sin(p)], -1)

def ecef(lat, lon, h=0.0):
    """position on/above the sphere: (R+h) * v  (spherical height, no ellipsoid)"""
    return (R + np.asarray(h))[..., None] * ll2v(lat, lon) if np.ndim(h) else (R + h) * ll2v(lat, lon)

def v2ll(v):
    v = np.asarray(v, float); v = v / np.linalg.norm(v, axis=-1, keepdims=True)
    return np.degrees(np.arcsin(np.clip(v[..., 2], -1, 1))), np.degrees(np.arctan2(v[..., 1], v[..., 0]))

def enu_basis(lat, lon):
    """local East, North, Up unit vectors at (lat,lon)"""
    p, l = np.radians(lat), np.radians(lon)
    E = np.array([-np.sin(l), np.cos(l), 0.0])
    N = np.array([-np.sin(p) * np.cos(l), -np.sin(p) * np.sin(l), np.cos(p)])
    U = np.array([np.cos(p) * np.cos(l), np.cos(p) * np.sin(l), np.sin(p)])
    return E, N, U

def to_enu(lat, lon, h, lat0, lon0, h0=0.0):
    """ENU metres of point (lat,lon,h) seen from origin (lat0,lon0,h0) - exact, through the Earth (app: toENU / enuProjH)"""
    E, N, U = enu_basis(lat0, lon0); d = ecef(lat, lon, h) - ecef(lat0, lon0, h0)
    return np.stack([d @ E, d @ N, d @ U], -1)

def to_three(e, n, u):
    """app scene axes: x = East, y = Up, z = -North (right-handed, Three.js y-up)"""
    return np.stack([e, u, -n], -1)

def haversine(lat1, lon1, lat2, lon2, r=R):
    p1, p2 = np.radians(lat1), np.radians(lat2); dp, dl = p2 - p1, np.radians(lon2 - lon1)
    return 2 * r * np.arcsin(np.sqrt(np.sin(dp / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2))

def bearing(lat1, lon1, lat2, lon2):
    p1, p2, dl = np.radians(lat1), np.radians(lat2), np.radians(lon2 - lon1)
    return (np.degrees(np.arctan2(np.sin(dl) * np.cos(p2), np.cos(p1) * np.sin(p2) - np.sin(p1) * np.cos(p2) * np.cos(dl))) + 360) % 360

def destination(lat, lon, brg, dist, r=R):
    """point reached from (lat,lon) along initial bearing brg after arc length dist (app: extras.gcPoint with d in degrees = dist/(R*pi/180))"""
    p, l, b, s = np.radians(lat), np.radians(lon), np.radians(brg), np.asarray(dist) / r
    p2 = np.arcsin(np.sin(p) * np.cos(s) + np.cos(p) * np.sin(s) * np.cos(b))
    l2 = l + np.arctan2(np.sin(b) * np.sin(s) * np.cos(p), np.cos(s) - np.sin(p) * np.sin(p2))
    return np.degrees(p2), (np.degrees(l2) + 540) % 360 - 180

def dir_vec(lat, lon, brg):
    """unit tangent d_theta = cos(theta) N + sin(theta) E at (lat,lon)"""
    E, N, _ = enu_basis(lat, lon); t = np.radians(brg)
    return np.cos(t) * N + np.sin(t) * E

def gc_normal(lat, lon, brg):
    """normal of the great-circle plane through v(lat,lon) heading brg: n = v x d_theta (unit). Plane: {p : p.n = 0}"""
    v = ll2v(lat, lon); n = np.cross(v, dir_vec(lat, lon, brg)); return n / np.linalg.norm(n)

def gc_point(lat, lon, brg, s):
    """parametric great circle: p(s) = cos(s) v + sin(s) d_theta, s = arc angle in radians (s = dist/R)"""
    v, d = ll2v(lat, lon), dir_vec(lat, lon, brg); s = np.asarray(s)[..., None]
    return np.cos(s) * v + np.sin(s) * d

def gc_intersect(n1, n2):
    """the two antipodal intersection points of two great circles: +-(n1 x n2)/|n1 x n2|"""
    x = np.cross(n1, n2); x = x / np.linalg.norm(x); return x, -x

def small_circle(lat, lon, radius_m, n=96):
    """circle of constant angular radius rho = radius_m/R around c: {p : p.c = cos rho}; samples p(t) = cos rho c + sin rho (cos t N + sin t E)"""
    c = ll2v(lat, lon); E, N, _ = enu_basis(lat, lon); rho = radius_m / R; t = np.linspace(0, 2 * np.pi, n + 1)[:, None]
    return np.cos(rho) * c + np.sin(rho) * (np.cos(t) * N + np.sin(t) * E)

def wedge_index(clat, clon, lat, lon, k=12, b0=0.0):
    """vortex wedge containing a point (any distance, whole globe): floor(((bearing - b0) mod 360) / (360/k))"""
    return (np.floor(((bearing(clat, clon, lat, lon) - b0) % 360) / (360 / k))).astype(int) % k

def in_lune(p, c_lat, c_lon, b1, b2):
    """sign test for the lune between half-great-circles at bearings b1<b2 (b2-b1<180) from vortex c: p.n_b1 < 0 and p.n_b2 > 0"""
    return (p @ gc_normal(c_lat, c_lon, b1) < 0) & (p @ gc_normal(c_lat, c_lon, b2) > 0)

def sph_polygon_area(latlon, r=R):
    """area of a simple spherical polygon (vertices joined by great-circle arcs), via sum of signed triangle excesses (van Oosterom-Strackee)"""
    V = ll2v(*np.asarray(latlon, float).T); c = V.mean(0); c /= np.linalg.norm(c); tot = 0.0
    for a, b in zip(V, np.roll(V, -1, 0)):
        num = np.dot(c, np.cross(a, b)); den = 1 + c @ a + a @ b + b @ c; tot += 2 * np.arctan2(num, den)
    return abs(tot) * r * r

def horizon_distance(h, r=R):
    """straight-line distance to the geometric horizon for eye height h: sqrt(2Rh + h^2); arc along ground = R*acos(R/(R+h))"""
    return np.sqrt(2 * r * h + h * h), r * np.arccos(r / (r + h))

def drop(d, r=R):
    """curvature drop of a ground point at horizontal arc distance d below the local tangent plane: R(1-cos(d/R)) ~ d^2/2R"""
    return r * (1 - np.cos(np.asarray(d) / r))

def flat_local(lat, lon, lat0, lon0):
    """the app's flat local mapping (figures, landmark pillars, streets): x = (lon-lon0)*111320*cos(lat0), z = -(lat-lat0)*111320"""
    return (np.asarray(lon) - lon0) * M_PER_DEG_FLAT * np.cos(np.radians(lat0)), -(np.asarray(lat) - lat0) * M_PER_DEG_FLAT

def antipode(lat, lon):
    return -lat, (lon + 360) % 360 - 180
