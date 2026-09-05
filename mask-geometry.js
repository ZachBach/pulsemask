/* FITMASK geometry engine — pure JS, no dependencies.
 * Full-face respirator: wraparound visor, inner oronasal cup, single chin
 * UV-C/PZT canister. Emits named parts as {positions, normals, indices}
 * in METERS, y-up. Consumed by the three.js viewer and the STL writer alike. */
(function (root) {
  'use strict';
  var TAU = Math.PI * 2;
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var smooth = function (e0, e1, x) { var t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

  /* ---------- 4x4, row-major ---------- */
  function ident() { return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]; }
  function mul(a, b) {
    var o = new Array(16);
    for (var r = 0; r < 4; r++) for (var c = 0; c < 4; c++) {
      var s = 0; for (var k = 0; k < 4; k++) s += a[r * 4 + k] * b[k * 4 + c];
      o[r * 4 + c] = s;
    }
    return o;
  }
  function T(x, y, z) { return [1,0,0,x, 0,1,0,y, 0,0,1,z, 0,0,0,1]; }
  function Rx(a) { var c = Math.cos(a), s = Math.sin(a); return [1,0,0,0, 0,c,-s,0, 0,s,c,0, 0,0,0,1]; }
  function Ry(a) { var c = Math.cos(a), s = Math.sin(a); return [c,0,s,0, 0,1,0,0, -s,0,c,0, 0,0,0,1]; }
  function Rz(a) { var c = Math.cos(a), s = Math.sin(a); return [c,-s,0,0, s,c,0,0, 0,0,1,0, 0,0,0,1]; }
  function xf(m, x, y, z) {
    return [m[0]*x + m[1]*y + m[2]*z + m[3], m[4]*x + m[5]*y + m[6]*z + m[7], m[8]*x + m[9]*y + m[10]*z + m[11]];
  }

  /* ---------- part accumulator ---------- */
  function Part(name, material, crease) {
    this.name = name; this.material = material;
    this.crease = crease == null ? 38 : crease;
    this.pos = []; this.idx = []; this._st = [ident()];
  }
  Part.prototype.push = function (m) { this._st.push(mul(this._st[this._st.length - 1], m)); return this; };
  Part.prototype.pop = function () { this._st.pop(); return this; };
  Part.prototype.v = function (x, y, z) {
    var p = xf(this._st[this._st.length - 1], x, y, z);
    this.pos.push(p[0], p[1], p[2]);
    return this.pos.length / 3 - 1;
  };
  Part.prototype.tri = function (a, b, c) { this.idx.push(a, b, c); };
  Part.prototype.quad = function (a, b, c, d) { this.idx.push(a, b, c, a, c, d); };

  /* ---------- primitives (local space; place with push/pop) ---------- */
  function cylinder(p, r0, r1, h, segs, capA, capB) {
    var bot = [], top = [], j, k, a, c, s;
    for (j = 0; j < segs; j++) {
      a = j / segs * TAU; c = Math.cos(a); s = Math.sin(a);
      bot.push(p.v(r0 * c, 0, r0 * s));
      top.push(p.v(r1 * c, h, r1 * s));
    }
    for (j = 0; j < segs; j++) { k = (j + 1) % segs; p.quad(bot[j], top[j], top[k], bot[k]); }
    if (capA && r0 > 1e-6) { var cb = p.v(0, 0, 0); for (j = 0; j < segs; j++) { k = (j + 1) % segs; p.tri(cb, bot[j], bot[k]); } }
    if (capB && r1 > 1e-6) { var ct = p.v(0, h, 0); for (j = 0; j < segs; j++) { k = (j + 1) % segs; p.tri(ct, top[k], top[j]); } }
  }

  /* profile [[r,y],...] revolved about +y; r→0 rings collapse to poles.

     WINDING. Rings are emitted in profile order, so for the ascending profiles
     every caller here uses, ring i is below ring i+1. The faces are wound so
     that a closed profile yields OUTWARD normals, matching cylinder(). This was
     backwards until the Track 4 validator caught it: all four closed lathes
     (pzt_blower_stack, uvc_reactor_housing, filter_cartridge, pzt_coalescer)
     came out with negative signed volume — closed, but inside-out, which a
     slicer can read as a void. It went unnoticed for so long because
     volumeOf() returns Math.abs(v), so the mass metric was right either way.

     For a profile that closes back on itself (a ring cross-section rather than
     a solid of revolution about the axis), what decides the normal direction is
     the orientation of that loop in the (r,y) plane: traverse it
     counter-clockwise — along the base outward, then up, then back inward — and
     the normals point out. Clockwise closes the surface just as well but leaves
     it inside-out, which is how intake_grille first came back. There is no
     runtime check for this; `node cli.mjs --validate` reports the volume sign. */
  function lathe(p, profile, segs) {
    var rings = [], i, j, k, row;
    for (i = 0; i < profile.length; i++) {
      var r = profile[i][0], y = profile[i][1];
      if (r < 1e-6) { rings.push([p.v(0, y, 0)]); continue; }
      row = [];
      for (j = 0; j < segs; j++) { var a = j / segs * TAU; row.push(p.v(r * Math.cos(a), y, r * Math.sin(a))); }
      rings.push(row);
    }
    for (i = 0; i < rings.length - 1; i++) {
      var lo = rings[i], hi = rings[i + 1];
      for (j = 0; j < segs; j++) {
        k = (j + 1) % segs;
        if (lo.length === 1 && hi.length === 1) continue;
        if (lo.length === 1) p.tri(lo[0], hi[j], hi[k]);
        else if (hi.length === 1) p.tri(hi[0], lo[k], lo[j]);
        else p.quad(lo[j], hi[j], hi[k], lo[k]);
      }
    }
  }

  function box(p, w, h, d) {
    var x = w / 2, y = h / 2, z = d / 2;
    var V = [[-x,-y, z],[ x,-y, z],[ x, y, z],[-x, y, z],[-x,-y,-z],[ x,-y,-z],[ x, y,-z],[-x, y,-z]]
      .map(function (q) { return p.v(q[0], q[1], q[2]); });
    p.quad(V[0], V[1], V[2], V[3]); p.quad(V[5], V[4], V[7], V[6]);
    p.quad(V[1], V[5], V[6], V[2]); p.quad(V[4], V[0], V[3], V[7]);
    p.quad(V[3], V[2], V[6], V[7]); p.quad(V[4], V[5], V[1], V[0]);
  }

  function tube(p, pts, r, segs) {
    var n = pts.length, rings = [], i, j, k, tangents = [];
    for (i = 0; i < n; i++) {
      var a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
      tangents.push(unit([b[0] - a[0], b[1] - a[1], b[2] - a[2]]));
    }
    var nrm = cross(tangents[0], [0, 1, 0]);
    if (Math.hypot(nrm[0], nrm[1], nrm[2]) < 1e-6) nrm = cross(tangents[0], [1, 0, 0]);
    nrm = unit(nrm);
    for (i = 0; i < n; i++) {
      var tg = tangents[i];
      nrm = unit(sub(nrm, scl(tg, dot(nrm, tg))));
      var bi = cross(tg, nrm), row = [];
      for (j = 0; j < segs; j++) {
        var a2 = j / segs * TAU, c = Math.cos(a2), s = Math.sin(a2);
        row.push(p.v(pts[i][0] + r * (c * nrm[0] + s * bi[0]),
                     pts[i][1] + r * (c * nrm[1] + s * bi[1]),
                     pts[i][2] + r * (c * nrm[2] + s * bi[2])));
      }
      rings.push(row);
    }
    for (i = 0; i < n; i++) { var hi = rings[(i + 1) % n], lo = rings[i];
      for (j = 0; j < segs; j++) { k = (j + 1) % segs; p.quad(lo[j], lo[k], hi[k], hi[j]); } }
  }

  /* open swept tube with end caps — EL-wire runs, horns. r may be a fn(t). */
  function strip(p, pts, r, segs) {
    var n = pts.length, rings = [], i, j, k;
    if (n < 2) return;
    var tangents = [];
    for (i = 0; i < n; i++) {
      var a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      var t = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      if (Math.hypot(t[0], t[1], t[2]) < 1e-9) t = [0, 1, 0];
      tangents.push(unit(t));
    }
    var nrm = cross(tangents[0], [0, 1, 0]);
    if (Math.hypot(nrm[0], nrm[1], nrm[2]) < 1e-6) nrm = cross(tangents[0], [1, 0, 0]);
    nrm = unit(nrm);
    for (i = 0; i < n; i++) {
      var tg = tangents[i];
      nrm = unit(sub(nrm, scl(tg, dot(nrm, tg))));
      var bi = cross(tg, nrm), row = [];
      var rr = (typeof r === 'function') ? r(i / (n - 1)) : r;
      for (j = 0; j < segs; j++) {
        var a2 = j / segs * TAU, c = Math.cos(a2), s2 = Math.sin(a2);
        row.push(p.v(pts[i][0] + rr * (c * nrm[0] + s2 * bi[0]),
                     pts[i][1] + rr * (c * nrm[1] + s2 * bi[1]),
                     pts[i][2] + rr * (c * nrm[2] + s2 * bi[2])));
      }
      rings.push(row);
    }
    for (i = 0; i < n - 1; i++) for (j = 0; j < segs; j++) {
      k = (j + 1) % segs;
      p.quad(rings[i][j], rings[i][k], rings[i + 1][k], rings[i + 1][j]);
    }
    var c0 = p.v(pts[0][0], pts[0][1], pts[0][2]);
    for (j = 0; j < segs; j++) { k = (j + 1) % segs; p.tri(c0, rings[0][k], rings[0][j]); }
    var c1 = p.v(pts[n - 1][0], pts[n - 1][1], pts[n - 1][2]);
    for (j = 0; j < segs; j++) { k = (j + 1) % segs; p.tri(c1, rings[n - 1][j], rings[n - 1][k]); }
  }

  /* orthonormal placement matrix from basis vectors + origin */
  function basis(r, u, n, p) {
    return [r[0], u[0], n[0], p[0],
            r[1], u[1], n[1], p[1],
            r[2], u[2], n[2], p[2],
            0, 0, 0, 1];
  }

  /* one lorica-squamata scale: root at origin, tip at -y, crown toward +z */
  function scalePlate(p, w, h, dome, thick) {
    var NU = 4, NV = 5, F2 = [], B2 = [], i, j;
    for (i = 0; i <= NU; i++) {
      var u = i / NU, rowF = [], rowB = [];
      var hw = w * 0.5 * Math.sqrt(Math.max(0.02, 1 - u * u * 0.90));
      for (j = 0; j <= NV; j++) {
        var v = j / NV * 2 - 1;
        var x = v * hw, y = -u * h;
        var z = dome * (1 - v * v) * (1 - u * 0.30);
        rowF.push(p.v(x, y, z));
        rowB.push(p.v(x, y, z - thick));
      }
      F2.push(rowF); B2.push(rowB);
    }
    for (i = 0; i < NU; i++) for (j = 0; j < NV; j++) {
      p.quad(F2[i][j], F2[i + 1][j], F2[i + 1][j + 1], F2[i][j + 1]);
      p.quad(B2[i][j], B2[i][j + 1], B2[i + 1][j + 1], B2[i + 1][j]);
    }
    for (i = 0; i < NU; i++) {
      p.quad(F2[i][0], B2[i][0], B2[i + 1][0], F2[i + 1][0]);
      p.quad(F2[i][NV], F2[i + 1][NV], B2[i + 1][NV], B2[i][NV]);
    }
    for (j = 0; j < NV; j++) {
      p.quad(F2[0][j], F2[0][j + 1], B2[0][j + 1], B2[0][j]);
      p.quad(F2[NU][j], B2[NU][j], B2[NU][j + 1], F2[NU][j + 1]);
    }
  }

  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function cross(a, b) { return [a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0]]; }
  function dot(a, b) { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }
  function scl(a, s) { return [a[0]*s, a[1]*s, a[2]*s]; }
  function unit(a) { var l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0]/l, a[1]/l, a[2]/l]; }

  function roundRect(w, h, rad, per) {
    var pts = [], C = [[ w/2 - rad,  h/2 - rad, 0], [-w/2 + rad,  h/2 - rad, Math.PI/2],
                       [-w/2 + rad, -h/2 + rad, Math.PI], [ w/2 - rad, -h/2 + rad, -Math.PI/2]];
    for (var c = 0; c < 4; c++) for (var i = 0; i < per; i++) {
      var a = C[c][2] + i / per * (Math.PI / 2);
      pts.push([C[c][0] + rad * Math.cos(a), C[c][1] + rad * Math.sin(a), 0]);
    }
    return pts;
  }

  /* ---------- crease-aware normals (smoothing groups) ---------- */
  function finalize(part) {
    var pos = part.pos, idx = part.idx, nf = idx.length / 3;
    var fn = new Float32Array(nf * 3), thr = Math.cos(part.crease * Math.PI / 180);
    var vf = [], i, f;
    for (i = 0; i < pos.length / 3; i++) vf.push(null);
    for (f = 0; f < nf; f++) {
      var a = idx[f*3]*3, b = idx[f*3+1]*3, c = idx[f*3+2]*3;
      var u = [pos[b]-pos[a], pos[b+1]-pos[a+1], pos[b+2]-pos[a+2]];
      var w = [pos[c]-pos[a], pos[c+1]-pos[a+1], pos[c+2]-pos[a+2]];
      var n = cross(u, w), L = Math.hypot(n[0], n[1], n[2]);
      if (L < 1e-12) { fn[f*3] = 0; fn[f*3+1] = 0; fn[f*3+2] = 0; }
      else { fn[f*3] = n[0]/L; fn[f*3+1] = n[1]/L; fn[f*3+2] = n[2]/L; }
      for (var e = 0; e < 3; e++) { var vi = idx[f*3+e]; if (!vf[vi]) vf[vi] = []; vf[vi].push(f); }
    }
    var outPos = pos.slice(), outNrm = new Array(pos.length).fill(0);
    for (var vi2 = 0; vi2 < vf.length; vi2++) {
      var faces = vf[vi2]; if (!faces) continue;
      var groups = [];
      for (var g = 0; g < faces.length; g++) {
        var ff = faces[g], nx = fn[ff*3], ny = fn[ff*3+1], nz = fn[ff*3+2];
        if (nx === 0 && ny === 0 && nz === 0) continue;
        var placed = false;
        for (var q = 0; q < groups.length; q++) {
          var gn = unit(groups[q].n);
          if (gn[0]*nx + gn[1]*ny + gn[2]*nz >= thr) {
            groups[q].n[0] += nx; groups[q].n[1] += ny; groups[q].n[2] += nz;
            groups[q].f.push(ff); placed = true; break;
          }
        }
        if (!placed) groups.push({ n: [nx, ny, nz], f: [ff] });
      }
      for (var q2 = 0; q2 < groups.length; q2++) {
        var gn2 = unit(groups[q2].n), target = vi2;
        if (q2 > 0) {
          target = outPos.length / 3;
          outPos.push(pos[vi2*3], pos[vi2*3+1], pos[vi2*3+2]);
          outNrm.push(0, 0, 0);
          for (var r2 = 0; r2 < groups[q2].f.length; r2++) {
            var ff2 = groups[q2].f[r2];
            for (var e2 = 0; e2 < 3; e2++) if (idx[ff2*3+e2] === vi2) idx[ff2*3+e2] = target;
          }
        }
        outNrm[target*3] = gn2[0]; outNrm[target*3+1] = gn2[1]; outNrm[target*3+2] = gn2[2];
      }
    }
    return {
      name: part.name, material: part.material,
      positions: new Float32Array(outPos),
      normals: new Float32Array(outNrm),
      indices: new Uint32Array(idx)
    };
  }

  /* Make every face in a part agree on which way is out.

     Why this exists: the shell's aperture walls used to pick their winding with
     a heuristic — is my normal pointing away from the hole centre — which is
     unreliable wherever a wall runs nearly tangential to that direction. About
     30 of them came out backwards, and a backwards quad duplicates its
     neighbours' directed edges instead of opposing them, so it shows up as
     equal numbers of duplicate and boundary edges in the same place. That is
     exactly what the validator reported for shell_outer: 120 and 120.

     Topology decides it here instead of geometry. Two faces sharing an edge
     agree iff they traverse that edge in OPPOSITE directions; breadth-first
     from one seed face propagates that rule across the whole surface. A final
     signed-volume check flips the entire part if the seed happened to be
     inward. Operates on the raw Part before finalize() splits vertices. */
  function orientPart(part, tol) {
    tol = tol || 1e-7;
    var pos = part.pos, idx = part.idx, inv = 1 / tol, i;
    var nv = pos.length / 3, weld = new Int32Array(nv), map = new Map(), wn = 0;
    for (i = 0; i < nv; i++) {
      var k = Math.round(pos[i*3]*inv) + ',' + Math.round(pos[i*3+1]*inv) + ',' + Math.round(pos[i*3+2]*inv);
      var w = map.get(k);
      if (w === undefined) { w = wn++; map.set(k, w); }
      weld[i] = w;
    }
    var nf = idx.length / 3, S = wn + 1;
    /* undirected edge -> the faces on it */
    var inc = new Map(), f, e;
    for (f = 0; f < nf; f++) {
      var a = weld[idx[f*3]], b = weld[idx[f*3+1]], c = weld[idx[f*3+2]];
      if (a === b || b === c || a === c) continue;
      var tri = [[a,b],[b,c],[c,a]];
      for (e = 0; e < 3; e++) {
        var u = tri[e][0], v = tri[e][1], ek = (u < v ? u * S + v : v * S + u);
        var lst = inc.get(ek); if (!lst) { lst = []; inc.set(ek, lst); }
        lst.push(f);
      }
    }
    var seen = new Uint8Array(nf), queue = [0], flipped = 0;
    seen[0] = 1;
    var dirOf = function (fi, u, v) {   /* does face fi traverse u->v ? */
      var A = weld[idx[fi*3]], B = weld[idx[fi*3+1]], C = weld[idx[fi*3+2]];
      return (A === u && B === v) || (B === u && C === v) || (C === u && A === v);
    };
    while (queue.length) {
      var cur = queue.pop();
      var ca = weld[idx[cur*3]], cb = weld[idx[cur*3+1]], cc = weld[idx[cur*3+2]];
      var ctri = [[ca,cb],[cb,cc],[cc,ca]];
      for (e = 0; e < 3; e++) {
        var eu = ctri[e][0], ev = ctri[e][1];
        var lst2 = inc.get(eu < ev ? eu * S + ev : ev * S + eu) || [];
        for (i = 0; i < lst2.length; i++) {
          var nb = lst2[i];
          if (nb === cur || seen[nb]) continue;
          /* agree = neighbour walks this edge the other way round */
          if (dirOf(nb, eu, ev)) {          /* same direction -> disagree, flip */
            var t = idx[nb*3+1]; idx[nb*3+1] = idx[nb*3+2]; idx[nb*3+2] = t;
            flipped++;
          }
          seen[nb] = 1; queue.push(nb);
        }
      }
    }
    var vol = 0;
    for (f = 0; f < nf; f++) {
      var p0 = idx[f*3]*3, p1 = idx[f*3+1]*3, p2 = idx[f*3+2]*3;
      vol += (pos[p0] * (pos[p1+1]*pos[p2+2] - pos[p1+2]*pos[p2+1])
            - pos[p0+1] * (pos[p1]*pos[p2+2] - pos[p1+2]*pos[p2])
            + pos[p0+2] * (pos[p1]*pos[p2+1] - pos[p1+1]*pos[p2])) / 6;
    }
    if (vol < 0) {
      for (f = 0; f < nf; f++) { var t2 = idx[f*3+1]; idx[f*3+1] = idx[f*3+2]; idx[f*3+2] = t2; }
      flipped = nf - flipped;
    }
    return flipped;
  }

  function volumeOf(part) {
    var v = 0, pos = part.pos, idx = part.idx;
    for (var f = 0; f < idx.length; f += 3) {
      var a = idx[f]*3, b = idx[f+1]*3, c = idx[f+2]*3;
      v += (pos[a] * (pos[b+1]*pos[c+2] - pos[b+2]*pos[c+1])
          - pos[a+1] * (pos[b]*pos[c+2] - pos[b+2]*pos[c])
          + pos[a+2] * (pos[b]*pos[c+1] - pos[b+1]*pos[c])) / 6;
    }
    return Math.abs(v);
  }

  /* ================= anatomy ================= */
  /* Canonical face relief, meters. Origin at subnasale, +z out of the face.
     y: +0.070 brow · +0.050 nasion · 0 subnasale · -0.030 lips · -0.072 menton */
  function faceBase(x, y, P) {
    var g = function (x0, y0, sx, sy, a) {
      var dx = (x - x0) / sx, dy = (y - y0) / sy;
      return a * Math.exp(-(dx * dx + dy * dy));
    };
    var nose = P.noseScale, chin = P.chinScale, cheek = P.cheekScale;
    var z = 0.0195 * cheek * Math.exp(-(Math.pow(x / 0.090, 2) + Math.pow((y + 0.010) / 0.120, 2)));
    z += g(0, 0.046, 0.011, 0.017, 0.011 * nose);
    z += g(0, 0.024, 0.012, 0.015, 0.016 * nose);
    z += g(0, 0.004, 0.014, 0.011, 0.019 * nose);
    z += g(-0.016, -0.002, 0.010, 0.007, 0.010 * nose);
    z += g( 0.016, -0.002, 0.010, 0.007, 0.010 * nose);
    z += g(0, -0.005, 0.006, 0.006, 0.007 * nose);
    z += g(0, -0.016, 0.010, 0.008, 0.0045);
    z += g(0, -0.023, 0.021, 0.006, 0.0060);
    z += g(0, -0.029, 0.024, 0.0035, -0.0035);
    z += g(0, -0.035, 0.019, 0.007, 0.0060);
    z += g(0, -0.046, 0.024, 0.008, -0.0050);
    z += g(0, -0.060, 0.026, 0.019, 0.011 * chin);
    z += g(-0.024, -0.026, 0.006, 0.016, -0.0035);
    z += g( 0.024, -0.026, 0.006, 0.016, -0.0035);
    z += g(-0.048, -0.056, 0.026, 0.026, -0.0090);
    z += g( 0.048, -0.056, 0.026, 0.026, -0.0090);
    z += g(-0.027, 0.070, 0.021, 0.011, 0.0085);
    z += g( 0.027, 0.070, 0.021, 0.011, 0.0085);
    z += g(-0.032, 0.057, 0.017, 0.012, -0.0065);
    z += g( 0.032, 0.057, 0.017, 0.012, -0.0065);
    return z;
  }

  function makeFace(P, hm) {
    var kx = P.faceWidth / 0.140, ky = P.faceHeight / 0.122;
    var kz = Math.sqrt(kx * ky) * P.depthScale;
    return function (x, y, gain) {
      var z = kz * faceBase(x / kx, y / ky, P);
      if (hm && gain > 0) z += gain * sampleHM(hm, x / kx, y / ky);
      return z;
    };
  }

  function sampleHM(hm, x, y) {
    var u = (x - hm.x0) / (hm.x1 - hm.x0), v = (y - hm.y1) / (hm.y0 - hm.y1);
    if (u < 0 || u > 1 || v < 0 || v > 1) return 0;
    var fx = u * (hm.w - 1), fy = v * (hm.h - 1);
    var ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
    var jx = Math.min(ix + 1, hm.w - 1), jy = Math.min(iy + 1, hm.h - 1);
    var d = hm.data;
    return (d[iy*hm.w+ix]*(1-tx) + d[iy*hm.w+jx]*tx) * (1-ty)
         + (d[jy*hm.w+ix]*(1-tx) + d[jy*hm.w+jx]*tx) * ty;
  }

  /* full-face rim: hairline over the brow, in front of the ears, under the chin */
  function rimAt(theta, P) {
    var c = Math.cos(theta), s = Math.sin(theta);
    var sgnc = c < 0 ? -1 : 1, sgns = s < 0 ? -1 : 1;
    var n = s >= 0 ? 2.9 : 2.35;
    var A = P.faceWidth * 0.487 * (1 + 0.03 * (1 - Math.abs(s)));
    var B = P.faceHeight * 0.811 * (s >= 0 ? (1 - 0.20 * Math.pow(Math.abs(c), 1.6)) : 1);
    return [A * sgnc * Math.pow(Math.abs(c), 2 / n), P.midY + B * sgns * Math.pow(Math.abs(s), 2 / n)];
  }

  /* aperture test — superellipse, or a rounded regular polygon when `sides` is set */
  function inHole(h, x, y, pad) {
    var rx = (h.rx || h.r) + (pad || 0), ry = (h.ry || h.r) + (pad || 0);
    var dx = (x - h.x) / rx, dy = (y - h.y) / ry;
    if (h.sides) {
      var rr = Math.hypot(dx, dy);
      if (rr < 1e-9) return true;
      var k = TAU / h.sides;
      var a = (((Math.atan2(dy, dx) + (h.rot || 0)) % k) + k) % k;
      var d = Math.cos(k * 0.5) / Math.cos(a - k * 0.5);
      d = d + (1 - d) * (h.round || 0);
      return rr < d;
    }
    var n = h.n || 2;
    return Math.pow(Math.abs(dx), n) + Math.pow(Math.abs(dy), n) < 1;
  }
  function holeEdge(h, phi, grow) {
    var rx = (h.rx || h.r) + grow, ry = (h.ry || h.r) + grow;
    var c = Math.cos(phi), s = Math.sin(phi);
    if (h.sides) {
      var k = TAU / h.sides;
      var a = (((phi + (h.rot || 0)) % k) + k) % k;
      var d = Math.cos(k * 0.5) / Math.cos(a - k * 0.5);
      d = d + (1 - d) * (h.round || 0);
      return [h.x + rx * d * c, h.y + ry * d * s];
    }
    var n = h.n || 2, sgnc = c < 0 ? -1 : 1, sgns = s < 0 ? -1 : 1;
    return [h.x + rx * sgnc * Math.pow(Math.abs(c), 2 / n),
            h.y + ry * sgns * Math.pow(Math.abs(s), 2 / n)];
  }

  /* ================= build ================= */
  var DEFAULTS = {
    faceWidth: 0.140, faceHeight: 0.122,
    noseScale: 1, chinScale: 1, cheekScale: 1, depthScale: 1,
    visorRx: 0.0565, visorRy: 0.0292, visorN: 3.0, visorT: 0.0022,
    visorSides: 6, visorRound: 0.22,
    panels: 8, seamDepth: 0.0016, vents: true, lights: true, wireR: 0.0017,
    scales: true, scaleRows: 8, scaleCols: 20, scaleW: 0.0112, scaleH: 0.0115,
    horns: true, crest: true, pvPerHorn: 7,
    hornCells: true, antenna: true, cellWhPerL: 240,
    plenum: 0.017, wall: 0.0026, cupWall: 0.0018, relief: 0.0045, sealR: 0.0042, sealComp: 0.0008,
    canR: 0.0245, canLen: 0.060, reactorLen: 0.028,
    ledCount: 16, ledPower: 12, flowLpm: 85, reflectance: 2.6, kUV: 1.2,
    pztSensors: 6, pztR: 0.0060,
    cup: true, seal: true, straps: true, exhale: true, canister: true, visor: true,
    segT: 136, segS: 48, explode: 0
  };

  var MATERIALS = {
    shell_polymer:   { color: '#dcd6c9', roughness: 0.58, metalness: 0.04 },
    seal_silicone:   { color: '#31343a', roughness: 0.93, metalness: 0.00 },
    cartridge_alloy: { color: '#8b9298', roughness: 0.33, metalness: 0.35 },
    visor_pc:        { color: '#c6ddcb', roughness: 0.05, metalness: 0.02, opacity: 0.32, transparent: true },
    uv_indicator:    { color: '#9dff5c', roughness: 0.14, metalness: 0.08, opacity: 0.74, transparent: true, emissive: '#4bd11a', emissiveIntensity: 1.05 },
    el_wire:         { color: '#c2ff9a', roughness: 0.22, metalness: 0.00, emissive: '#5cff2e', emissiveIntensity: 2.8 },
    bronze:          { color: '#9c7c46', roughness: 0.34, metalness: 0.40 },
    copper:          { color: '#b8703c', roughness: 0.30, metalness: 0.42 },
    cell_pouch:      { color: '#2a2f38', roughness: 0.55, metalness: 0.10 },
    pv_cell:         { color: '#141a26', roughness: 0.16, metalness: 0.30 },
    pzt_ceramic:     { color: '#d4b23f', roughness: 0.26, metalness: 0.40 },
    face_form:       { color: '#b6a695', roughness: 0.95, metalness: 0.00 }
  };

  function build(opts) {
    var P = {}, k;
    for (k in DEFAULTS) P[k] = DEFAULTS[k];
    for (k in (opts || {})) if (opts[k] !== undefined) P[k] = opts[k];
    P.midY = P.faceHeight * 0.074;
    var hm = P.heightmap || null;
    var F = makeFace(P, hm);
    var parts = [], ex = P.explode, i, j;

    /* --- apertures --- */
    var visor = { x: 0, y: P.midY + P.faceHeight * 0.392, rx: P.visorRx, ry: P.visorRy,
                  n: P.visorN, sides: P.visorSides, round: P.visorRound, rot: 0 };
    var chinY = P.midY - P.faceHeight * 0.520;
    var exX = P.faceWidth * 0.335, exY = P.midY - P.faceHeight * 0.300;
    var holes = [];
    if (P.visor) holes.push(visor);
    if (P.canister) holes.push({ x: 0, y: chinY, r: P.canR * 0.62 });
    if (P.exhale) holes.push({ x: -exX, y: exY, r: 0.0125 }, { x: exX, y: exY, r: 0.0125 });

    /* --- clearance field --- */
    var pt = function (s, th) {
      var rim = rimAt(th, P);
      return [s * rim[0], P.midY + s * (rim[1] - P.midY)];
    };
    var sOf = function (x, y) {
      var dy = y - P.midY, th = Math.atan2(dy, x), rim = rimAt(th, P);
      var rl = Math.hypot(rim[0], rim[1] - P.midY) || 1;
      return Math.min(1, Math.hypot(x, dy) / rl);
    };
    var gapAt = function (s, x, y) {
      var bx = x / (P.faceWidth * 0.40), by = (y - (P.midY - P.faceHeight * 0.34)) / (P.faceHeight * 0.42);
      var land = (1 - smooth(0.80, 1.0, s)) * Math.exp(-(bx * bx + by * by) * 0.55);
      if (P.visor) {
        var vx = (x - visor.x) / (visor.rx + 0.016), vy = (y - visor.y) / (visor.ry + 0.016);
        land *= smooth(0.0, 1.0, Math.min(1, Math.hypot(vx, vy)));
      }
      return 0.0010 + P.plenum * land;
    };
    var reliefAt = function (s) { return P.relief * (1 - smooth(0.55, 0.92, s)); };
    /* armour panelling: recessed seams + crowned panels on the outer skin only */
    var seam = function (s, th) {
      if (s > 0.93) return 0;
      var a = th / TAU * P.panels, fa = Math.abs(a - Math.round(a));
      var g = 0.0013 * Math.sin(Math.PI * fa);
      g -= P.seamDepth * Math.exp(-Math.pow(fa / 0.045, 2));
      g -= P.seamDepth * 0.85 * Math.exp(-Math.pow((s - 0.44) / 0.030, 2));
      g -= P.seamDepth * 0.85 * Math.exp(-Math.pow((s - 0.76) / 0.030, 2));
      return g * (1 - smooth(0.86, 0.93, s));
    };
    var shellZ = function (x, y) { var s = sOf(x, y); return F(x, y, 0) + gapAt(s, x, y) + P.wall; };
    var cupCy = P.midY - P.faceHeight * 0.245;
    var airPath = null;
    var base = mul(T(0, chinY - ex * 0.02, shellZ(0, chinY) + ex * 0.06), Rx(Math.PI / 2 + 0.92));

    /* --- outer shell --- */
    var shell = new Part('shell_outer', 'shell_polymer', 52);
    var nT = P.segT, nS = P.segS, ringO = [], ringI = [], deadArea = 0;
    for (i = 0; i <= nS; i++) {
      var s = i / nS, rowO = [], rowI = [], count = i === 0 ? 1 : nT;
      for (j = 0; j < count; j++) {
        var th = j / nT * TAU, q = pt(s, th);
        var zi = F(q[0], q[1], reliefAt(s)) + gapAt(s, q[0], q[1]);
        rowI.push(shell.v(q[0], q[1], zi));
        rowO.push(shell.v(q[0], q[1], zi + P.wall + seam(s, th)));
      }
      ringO.push(rowO); ringI.push(rowI);
    }
    var O = function (a, b) { return ringO[a][a === 0 ? 0 : ((b % nT) + nT) % nT]; };
    var I = function (a, b) { return ringI[a][a === 0 ? 0 : ((b % nT) + nT) % nT]; };
    var kept = [];
    for (i = 0; i < nS; i++) {
      kept.push([]);
      for (j = 0; j < nT; j++) {
        var cq = pt((i + 0.5) / nS, (j + 0.5) / nT * TAU), keep = true;
        for (var h = 0; h < holes.length; h++) if (inHole(holes[h], cq[0], cq[1], 0)) { keep = false; break; }
        kept[i].push(keep);
      }
    }
    for (i = 0; i < nS; i++) for (j = 0; j < nT; j++) {
      if (!kept[i][j]) continue;
      if (i === 0) { shell.tri(O(0, 0), O(1, j), O(1, j + 1)); shell.tri(I(0, 0), I(1, j + 1), I(1, j)); }
      else { shell.quad(O(i, j), O(i + 1, j), O(i + 1, j + 1), O(i, j + 1));
             shell.quad(I(i, j), I(i, j + 1), I(i + 1, j + 1), I(i + 1, j)); }
    }
    var wallQuad = function (o1, o2, i1, i2, mx, my, hx, hy) {
      var pA = [shell.pos[o1*3], shell.pos[o1*3+1], shell.pos[o1*3+2]];
      var pB = [shell.pos[o2*3], shell.pos[o2*3+1], shell.pos[o2*3+2]];
      var pC = [shell.pos[i2*3], shell.pos[i2*3+1], shell.pos[i2*3+2]];
      var n = cross(sub(pB, pA), sub(pC, pA));
      if (dot(n, [mx - hx, my - hy, 0]) > 0) shell.quad(o1, i1, i2, o2); else shell.quad(o1, o2, i2, i1);
    };
    for (i = 0; i < nS; i++) for (j = 0; j < nT; j++) {
      if (kept[i][j]) continue;
      var cc = pt((i + 0.5) / nS, (j + 0.5) / nT * TAU), hole = null;
      for (var hh = 0; hh < holes.length; hh++) if (inHole(holes[hh], cc[0], cc[1], 0.006)) hole = holes[hh];
      if (!hole) hole = { x: cc[0], y: cc[1] };
      var nbr = [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]];
      for (var d = 0; d < 4; d++) {
        var ni = nbr[d][0], nj = ((nbr[d][1] % nT) + nT) % nT;
        if (!(ni < 0 || ni >= nS ? true : kept[ni][nj])) continue;
        var e1, e2, mid;
        if (d === 0) { e1 = [i, j]; e2 = [i, j + 1]; mid = pt(i / nS, (j + 0.5) / nT * TAU); }
        else if (d === 1) { e1 = [i + 1, j]; e2 = [i + 1, j + 1]; mid = pt((i + 1) / nS, (j + 0.5) / nT * TAU); }
        else if (d === 2) { e1 = [i, j]; e2 = [i + 1, j]; mid = pt((i + 0.5) / nS, j / nT * TAU); }
        else { e1 = [i, j + 1]; e2 = [i + 1, j + 1]; mid = pt((i + 0.5) / nS, (j + 1) / nT * TAU); }
        if (e1[0] === 0 || e2[0] === 0) continue;
        wallQuad(O(e1[0], e1[1]), O(e2[0], e2[1]), I(e1[0], e1[1]), I(e2[0], e2[1]), mid[0], mid[1], hole.x, hole.y);
      }
    }
    for (j = 0; j < nT; j++) shell.quad(O(nS, j), I(nS, j), I(nS, j + 1), O(nS, j + 1));
    /* wallQuad above picks its winding from a hole-centre heuristic that is
       unreliable on tangential segments; roughly 30 quads came out reversed.
       Settle it topologically instead of trying to out-guess the geometry. */
    orientPart(shell);
    parts.push(shell);

    /* --- wraparound visor lens --- */
    if (P.visor) {
      var lens = new Part('visor_lens', 'visor_pc', 40);
      var lT = 96, lS = 14, lapF = [], lapB = [], lip = 0.0055;
      for (i = 0; i <= lS; i++) {
        var t = i / lS, rf = [], rb = [], cnt = i === 0 ? 1 : lT;
        for (j = 0; j < cnt; j++) {
          var pe = holeEdge(visor, j / lT * TAU, lip);
          var lx = visor.x + t * (pe[0] - visor.x), ly = visor.y + t * (pe[1] - visor.y);
          var lz = shellZ(lx, ly) - 0.0009 + ex * 0.055;
          rf.push(lens.v(lx, ly, lz + P.visorT));
          rb.push(lens.v(lx, ly, lz));
        }
        lapF.push(rf); lapB.push(rb);
      }
      var LF = function (a, b) { return lapF[a][a === 0 ? 0 : ((b % lT) + lT) % lT]; };
      var LB = function (a, b) { return lapB[a][a === 0 ? 0 : ((b % lT) + lT) % lT]; };
      for (i = 0; i < lS; i++) for (j = 0; j < lT; j++) {
        if (i === 0) { lens.tri(LF(0, 0), LF(1, j), LF(1, j + 1)); lens.tri(LB(0, 0), LB(1, j + 1), LB(1, j)); }
        else { lens.quad(LF(i, j), LF(i + 1, j), LF(i + 1, j + 1), LF(i, j + 1));
               lens.quad(LB(i, j), LB(i, j + 1), LB(i + 1, j + 1), LB(i + 1, j)); }
      }
      for (j = 0; j < lT; j++) lens.quad(LF(lS, j), LB(lS, j), LB(lS, j + 1), LF(lS, j + 1));
      parts.push(lens);

      var vg = new Part('visor_gasket', 'seal_silicone', 60), vgp = [];
      for (j = 0; j < 108; j++) {
        var ge = holeEdge(visor, j / 108 * TAU, 0.0022);
        vgp.push([ge[0], ge[1], shellZ(ge[0], ge[1]) - 0.0012]);
      }
      tube(vg, vgp, 0.0024, 12);
      parts.push(vg);
    }

    /* --- perimeter seal + PZT fit-telemetry sensors --- */
    if (P.seal) {
      var seal = new Part('seal_lip', 'seal_silicone', 60), path = [];
      for (j = 0; j < 120; j++) {
        var th2 = j / 120 * TAU, q2 = pt(0.982, th2);
        /* centreline set from the target interference, so the bead underside
           lands sealComp below the skin regardless of bead diameter */
        path.push([q2[0], q2[1], F(q2[0], q2[1], 0) + P.sealR - P.sealComp]);
      }
      tube(seal, path, P.sealR, 16);
      parts.push(seal);

      var sens = new Part('pzt_seal_sensor', 'pzt_ceramic', 32);
      for (var t2 = 0; t2 < P.pztSensors; t2++) {
        var ang = (t2 + 0.5) / P.pztSensors * TAU, qs = pt(0.982, ang);
        var zs = F(qs[0], qs[1], 0) + P.sealR - P.sealComp;
        sens.push(mul(T(qs[0], qs[1], zs), Rx(Math.PI / 2)));
        cylinder(sens, 0.0042, 0.0042, P.sealR * 1.25, 20, true, true);
        sens.pop();
      }
      parts.push(sens);
    }

    /* --- inner oronasal cup: isolates breathing volume from the visor --- */
    if (P.cup) {
      var cup = new Part('oronasal_cup', 'seal_silicone', 40);
      var cT = 92, cS = 26, cCx = 0, cCy = cupCy;
      var cupPt = function (s2, th3) {
        var c = Math.cos(th3), sn = Math.sin(th3), nn = 2.5;
        var sc = c < 0 ? -1 : 1, ss = sn < 0 ? -1 : 1;
        var A = P.faceWidth * 0.335, B = sn >= 0 ? P.faceHeight * 0.415 : P.faceHeight * 0.395;
        return [cCx + s2 * A * sc * Math.pow(Math.abs(c), 2 / nn),
                cCy + s2 * B * ss * Math.pow(Math.abs(sn), 2 / nn)];
      };
      var cupGap = function (s2, x, y) {
        return 0.0009 + 0.0105 * (1 - smooth(0.72, 1.0, s2));
      };
      var cRO = [], cRI = [];
      var cupHoles = [{ x: 0, y: cCy - P.faceHeight * 0.235, r: P.canR * 0.55 }];
      if (P.exhale) cupHoles.push({ x: -exX * 0.86, y: exY, r: 0.0105 }, { x: exX * 0.86, y: exY, r: 0.0105 });
      for (i = 0; i <= cS; i++) {
        var cs = i / cS, ro = [], ri = [], cn = i === 0 ? 1 : cT;
        for (j = 0; j < cn; j++) {
          var cq2 = cupPt(cs, j / cT * TAU);
          var czi = F(cq2[0], cq2[1], reliefAt(sOf(cq2[0], cq2[1])) * 0.6) + cupGap(cs, cq2[0], cq2[1]);
          ri.push(cup.v(cq2[0], cq2[1], czi));
          ro.push(cup.v(cq2[0], cq2[1], czi + P.cupWall));
          if (i > 0) deadArea += 1;
        }
        cRO.push(ro); cRI.push(ri);
      }
      var CO = function (a, b) { return cRO[a][a === 0 ? 0 : ((b % cT) + cT) % cT]; };
      var CI = function (a, b) { return cRI[a][a === 0 ? 0 : ((b % cT) + cT) % cT]; };
      var cKept = [];
      for (i = 0; i < cS; i++) {
        cKept.push([]);
        for (j = 0; j < cT; j++) {
          var cm = cupPt((i + 0.5) / cS, (j + 0.5) / cT * TAU), kp = true;
          for (var ch = 0; ch < cupHoles.length; ch++) if (inHole(cupHoles[ch], cm[0], cm[1], 0)) { kp = false; break; }
          cKept[i].push(kp);
        }
      }
      for (i = 0; i < cS; i++) for (j = 0; j < cT; j++) {
        if (!cKept[i][j]) continue;
        if (i === 0) { cup.tri(CO(0, 0), CO(1, j), CO(1, j + 1)); cup.tri(CI(0, 0), CI(1, j + 1), CI(1, j)); }
        else { cup.quad(CO(i, j), CO(i + 1, j), CO(i + 1, j + 1), CO(i, j + 1));
               cup.quad(CI(i, j), CI(i, j + 1), CI(i + 1, j + 1), CI(i + 1, j)); }
      }
      for (i = 0; i < cS; i++) for (j = 0; j < cT; j++) {
        if (cKept[i][j]) continue;
        var cmid = cupPt((i + 0.5) / cS, (j + 0.5) / cT * TAU), chl = null;
        for (var c2 = 0; c2 < cupHoles.length; c2++) if (inHole(cupHoles[c2], cmid[0], cmid[1], 0.006)) chl = cupHoles[c2];
        if (!chl) chl = { x: cmid[0], y: cmid[1] };
        var cnb = [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]];
        for (var d2 = 0; d2 < 4; d2++) {
          var ci = cnb[d2][0], cj = ((cnb[d2][1] % cT) + cT) % cT;
          /* Out-of-range neighbours used to count as "kept", so a dropped cell
             on the bottom row emitted a rim wall — and the loop below already
             emits a rim quad for every j, unconditionally. Two coincident quads
             on the same four vertices: 36 duplicate faces and 18 edges with
             four faces on them. The pole is closed by the f1/f2 === 0 guard and
             the rim by that loop, so neither belongs here. */
          if (ci < 0 || ci >= cS) continue;
          if (!cKept[ci][cj]) continue;
          var f1, f2, fm;
          if (d2 === 0) { f1 = [i, j]; f2 = [i, j + 1]; fm = cupPt(i / cS, (j + 0.5) / cT * TAU); }
          else if (d2 === 1) { f1 = [i + 1, j]; f2 = [i + 1, j + 1]; fm = cupPt((i + 1) / cS, (j + 0.5) / cT * TAU); }
          else if (d2 === 2) { f1 = [i, j]; f2 = [i + 1, j]; fm = cupPt((i + 0.5) / cS, j / cT * TAU); }
          else { f1 = [i, j + 1]; f2 = [i + 1, j + 1]; fm = cupPt((i + 0.5) / cS, (j + 1) / cT * TAU); }
          if (f1[0] === 0 || f2[0] === 0) continue;
          var a1 = CO(f1[0], f1[1]), a2 = CO(f2[0], f2[1]), b1 = CI(f1[0], f1[1]), b2 = CI(f2[0], f2[1]);
          var pA2 = [cup.pos[a1*3], cup.pos[a1*3+1], cup.pos[a1*3+2]];
          var pB2 = [cup.pos[a2*3], cup.pos[a2*3+1], cup.pos[a2*3+2]];
          var pC2 = [cup.pos[b2*3], cup.pos[b2*3+1], cup.pos[b2*3+2]];
          var nn2 = cross(sub(pB2, pA2), sub(pC2, pA2));
          if (dot(nn2, [fm[0] - chl.x, fm[1] - chl.y, 0]) > 0) cup.quad(a1, b1, b2, a2); else cup.quad(a1, a2, b2, b1);
        }
      }
      /* Rim cap, but only where the last row actually has material. The exhale
         apertures cut through the rim, and capping across a notch that is not
         there left edges with nothing to pair against. The notch sides are
         closed by the wall loop above. */
      for (j = 0; j < cT; j++) {
        if (!cKept[cS - 1][((j % cT) + cT) % cT]) continue;
        cup.quad(CO(cS, j), CI(cS, j), CI(cS, j + 1), CO(cS, j + 1));
      }
      /* Same hole-centre heuristic as the shell walls, same unreliability. */
      orientPart(cup);
      parts.push(cup);
    }

    /* --- chin canister: intake → PZT coalescer → filter → UV reactor → piezo blower --- */
    if (P.canister) {
      var R = P.canR, RL = P.reactorLen;
      /* canLen is a minimum: the housing must hold reactor + filter, so it
         grows with long reactors — otherwise fl goes negative above 34 mm and
         the filter lathe runs backwards into a self-intersecting shell */
      var L = Math.max(P.canLen, RL + 0.032);
      var cz0 = shellZ(0, chinY);

      var collar = new Part('canister_collar', 'shell_polymer', 32);
      collar.push(mul(base, T(0, -0.012, 0)));
      /* Was two uncapped cylinders at these radii — 176 boundary edges and no
         wall, so it could not be printed as a solid. Same two radii, now one
         closed annular profile: the ends are capped by the profile returning to
         its start, which is the pattern pzt_coalescer already used. */
      lathe(collar, [[R * 0.57, 0], [R * 0.66, 0], [R * 0.66, 0.020],
                     [R * 0.57, 0.020], [R * 0.57, 0]], 44);
      collar.pop(); parts.push(collar);

      var blower = new Part('pzt_blower_stack', 'pzt_ceramic', 32);
      blower.push(mul(base, T(0, 0.004 + ex * 0.012, 0)));
      lathe(blower, [[0, 0], [R * 0.80, 0], [R * 0.80, 0.0030], [R * 0.62, 0.0042],
                     [R * 0.62, 0.0070], [R * 0.80, 0.0082], [R * 0.80, 0.0112], [0, 0.0112]], 44);
      blower.pop(); parts.push(blower);

      var y0 = 0.017 + ex * 0.026;
      var reactor = new Part('uvc_reactor_housing', 'cartridge_alloy', 34);
      reactor.push(mul(base, T(0, y0, 0)));
      lathe(reactor, [[0, 0], [R * 0.93, 0], [R * 0.97, 0.0030], [R * 0.97, RL * 0.30],
                      [R * 0.91, RL * 0.34], [R * 0.91, RL * 0.66], [R * 0.97, RL * 0.70],
                      [R * 0.97, RL - 0.003], [R * 0.93, RL], [0, RL]], 8);
      reactor.pop(); parts.push(reactor);

      var band = new Part('uv_status_band', 'uv_indicator', 40);
      band.push(mul(base, T(0, y0 + RL * 0.36, 0)));
      /* Was a zero-thickness cylinder — a surface, not a solid, so it had 88
         boundary edges and nothing to print. Given a wall straddling the old
         radius (0.860–0.890 R, mean unchanged at 0.875 R) so it stays exactly
         where it sat in the reactor waist and still reads as an indicator band. */
      lathe(band, [[R * 0.860, 0], [R * 0.890, 0], [R * 0.890, RL * 0.28],
                   [R * 0.860, RL * 0.28], [R * 0.860, 0]], 44);
      band.pop(); parts.push(band);

      var leds = new Part('uvc_led_array', 'cartridge_alloy', 32);
      [0.16, 0.84].forEach(function (fr) {
        for (var l = 0; l < P.ledCount / 2; l++) {
          var al = l / (P.ledCount / 2) * TAU;
          leds.push(mul(mul(base, T(Math.cos(al) * R * 0.80, y0 + RL * fr, Math.sin(al) * R * 0.80)), Rz(Math.PI / 2)));
          cylinder(leds, 0.0021, 0.0021, 0.0038, 14, true, true);
          leds.pop();
        }
      });
      parts.push(leds);

      var capsid = new Part('pzt_capsid_ring', 'pzt_ceramic', 32);
      capsid.push(mul(base, T(0, y0 + RL * 0.50 - 0.0022, 0)));
      cylinder(capsid, R * 0.955, R * 0.955, 0.0044, 44, true, true);
      capsid.pop(); parts.push(capsid);

      var y1 = y0 + RL + 0.002 + ex * 0.026;
      var filt = new Part('filter_cartridge', 'cartridge_alloy', 34);
      filt.push(mul(base, T(0, y1, 0)));
      var prof = [[0, 0], [R * 0.86, 0], [R * 0.94, 0.0035]];
      var fl = L - RL - 0.026;
      for (var pl = 0; pl < 4; pl++) {
        var yy = 0.0055 + pl / 3 * (fl - 0.010);
        prof.push([R * 0.965, yy], [R, yy + 0.0022]);
      }
      prof.push([R * 0.965, fl - 0.001], [R * 0.90, fl + 0.0020], [R * 0.66, fl + 0.0042], [0, fl + 0.0042]);
      lathe(filt, prof, 8);
      filt.pop(); parts.push(filt);

      var coal = new Part('pzt_coalescer', 'pzt_ceramic', 32);
      coal.push(mul(base, T(0, y1 + fl + 0.0042 + ex * 0.014, 0)));
      lathe(coal, [[R * 0.40, 0], [R * 0.92, 0], [R * 0.92, 0.0032], [R * 0.40, 0.0032], [R * 0.40, 0]], 44);
      coal.pop(); parts.push(coal);

      var grille = new Part('intake_grille', 'shell_polymer', 40);
      grille.push(mul(base, T(0, y1 + fl + 0.0074 + ex * 0.014, 0)));
      for (var g2 = 0; g2 < 3; g2++) {
        var rr = R * (0.26 + g2 * 0.24);
        /* Each concentric ridge was an open arc — 80 boundary edges apiece,
           240 across the three. Returning to the start point closes the
           triangular cross-section into a solid ring. Corners run
           counter-clockwise in the (r,y) plane — base outward, then up to the
           apex — because that is the orientation lathe() turns into outward
           normals; the clockwise ordering closed it but left it inside-out. */
        lathe(grille, [[rr - 0.0019, 0], [rr + 0.0019, 0], [rr, 0.0024], [rr - 0.0019, 0]], 40);
      }
      /* capA was false, leaving the centre boss open at the bottom (18 edges). */
      cylinder(grille, R * 0.09, R * 0.09, 0.0038, 18, true, true);
      grille.pop(); parts.push(grille);

      var ctrl = new Part('controller_band', 'cartridge_alloy', 34);
      ctrl.push(mul(base, T(0, 0.0032, 0)));
      /* Trailing [R*0.84, 0] closes the cross-section back to its start — the
         profile described an open band before, leaving 88 boundary edges. */
      lathe(ctrl, [[R * 0.84, 0], [R * 0.99, 0.0022], [R * 0.99, 0.0102],
                   [R * 0.84, 0.0124], [R * 0.84, 0]], 44);
      ctrl.pop();
      ctrl.push(mul(mul(base, T(0, 0.0062, R * 0.99)), Rx(Math.PI / 2)));
      box(ctrl, 0.0098, 0.0034, 0.0022);
      ctrl.pop(); parts.push(ctrl);

      var stat = new Part('status_strip', 'uv_indicator', 34);
      stat.push(mul(mul(base, T(0, 0.0062, -R * 0.99)), Rx(Math.PI / 2)));
      box(stat, 0.026, 0.0032, 0.0020);
      stat.pop(); parts.push(stat);

      /* air path, for the flow visualisation */
      var intake = [];
      for (var ap = 0; ap <= 14; ap++) {
        var ay = (1 - ap / 14) * (y1 + fl + 0.008);
        intake.push(xf(base, 0, ay, 0));
      }
      intake.push([0, chinY, cz0 - 0.008]);
      intake.push([0, cupCy - P.faceHeight * 0.14, F(0, cupCy - P.faceHeight * 0.14, 0) + 0.008]);
      intake.push([0, cupCy, F(0, cupCy, 0) + 0.009]);
      airPath = { intake: intake, exhale: [-1, 1].map(function (sg) {
        return [[0, cupCy, F(0, cupCy, 0) + 0.008],
                [sg * exX * 0.6, exY + 0.004, F(sg * exX * 0.6, exY, 0) + 0.008],
                [sg * exX, exY, shellZ(sg * exX, exY) + 0.004],
                [sg * exX * 1.22, exY - 0.004, shellZ(sg * exX, exY) + 0.026]];
      }) };
    }

    /* --- cheek exhale valves with piezo energy harvesters --- */
    if (P.exhale) {
      var valve = new Part('exhale_valve', 'shell_polymer', 34);
      var dia = new Part('valve_diaphragm', 'seal_silicone', 40);
      var harv = new Part('pzt_harvester', 'pzt_ceramic', 32);
      [-1, 1].forEach(function (sg) {
        var vx = sg * exX, vy = exY, vz = shellZ(vx, vy);
        var vb = mul(mul(T(vx + sg * ex * 0.05, vy, vz + ex * 0.03), Ry(sg * 0.55)), Rx(Math.PI / 2));
        valve.push(vb);
        /* Leading [0, -0.0020] closes the base to the axis. The profile used to
           start at r = 0.0135, leaving an open ring — 6 boundary edges per
           valve, 12 across the pair. The cover now has a floor. */
        lathe(valve, [[0, -0.0020], [0.0135, -0.0020], [0.0162, 0.0012], [0.0162, 0.0052],
                      [0.0138, 0.0090], [0.0082, 0.0112], [0, 0.0120]], 6);
        valve.pop();
        for (var vf2 = 0; vf2 < 3; vf2++) {
          valve.push(mul(mul(vb, T(0, 0.0064, 0)), Ry(vf2 / 3 * Math.PI)));
          box(valve, 0.0235, 0.0024, 0.0030);
          valve.pop();
        }
        dia.push(mul(vb, T(0, -0.0016, 0)));
        cylinder(dia, 0.0126, 0.0126, 0.0012, 40, true, true);
        dia.pop();
        harv.push(mul(vb, T(0, 0.0034, 0)));
        cylinder(harv, 0.0092, 0.0092, 0.0016, 32, true, true);
        harv.pop();
      });
      parts.push(valve, dia, harv);
    }

    /* --- strap anchors --- */
    if (P.straps) {
      var anch = new Part('strap_anchor', 'shell_polymer', 40);
      [16, 164, 206, 334].forEach(function (deg) {
        var th3 = deg * Math.PI / 180, q3 = pt(1.0, th3);
        var z3 = F(q3[0], q3[1], 0) + gapAt(1, q3[0], q3[1]) + P.wall;
        var out = q3[0] < 0 ? -1 : 1;
        anch.push(mul(mul(T(q3[0] + out * 0.005, q3[1], z3 - 0.003), Ry(out * 0.90)), Rz(Math.PI / 2)));
        tube(anch, roundRect(0.026, 0.012, 0.0038, 5), 0.0027, 10);
        anch.pop();
      });
      parts.push(anch);
    }

    /* --- cheek vent slats --- */
    if (P.vents) {
      var vent = new Part('vent_slats', 'shell_polymer', 40);
      [-1, 1].forEach(function (sg) {
        for (var v2 = 0; v2 < 5; v2++) {
          var vy2 = P.midY + 0.007 - v2 * 0.0054;
          var vx2 = sg * P.faceWidth * 0.395;
          vent.push(mul(mul(T(vx2, vy2, shellZ(vx2, vy2) - 0.0009), Ry(sg * 0.82)), Rz(sg * -0.32)));
          box(vent, 0.0235, 0.0021, 0.0032);
          vent.pop();
        }
      });
      parts.push(vent);
    }

    /* --- lorica squamata: dragon-scale hood over crown and temples --- */
    var sp = function (s, th) {
      var q = pt(s, th);
      return [q[0], q[1], F(q[0], q[1], 0) + gapAt(s, q[0], q[1]) + P.wall + seam(s, th)];
    };
    var headC = [0, P.midY, -0.030];
    var hornPaths = [];
    var cellVol = 0;
    if (P.scales) {
      var scls = new Part('dragon_scales', 'bronze', 40);
      for (var sr = 0; sr < P.scaleRows; sr++) {
        var sv3 = 0.58 + (0.92 - 0.58) * sr / (P.scaleRows - 1);
        var soff = (sr % 2) * 0.5;
        for (var sc = 0; sc < P.scaleCols; sc++) {
          var th6 = (-14 + 208 * ((sc + soff) / P.scaleCols)) * Math.PI / 180;
          var p0 = sp(sv3, th6), blocked = false;
          for (var q8 = 0; q8 < holes.length; q8++)
            if (inHole(holes[q8], p0[0], p0[1], 0.010)) { blocked = true; break; }
          if (blocked) continue;
          var du = unit(sub(p0, sp(Math.min(1, sv3 + 0.02), th6)));
          var nn3 = unit(cross(unit(sub(sp(sv3, th6 + 0.05), p0)), du));
          if (dot(nn3, sub(p0, headC)) < 0) nn3 = scl(nn3, -1);
          var dr = unit(cross(du, nn3));
          scls.push(basis(dr, du, nn3, [p0[0] + nn3[0] * 0.0004,
                                        p0[1] + nn3[1] * 0.0004,
                                        p0[2] + nn3[2] * 0.0004]));
          scalePlate(scls, P.scaleW, P.scaleH, 0.0011, 0.0009);
          scls.pop();
        }
      }
      parts.push(scls);
    }

    /* --- galea horns carrying miniature PV arrays --- */
    if (P.horns) {
      var horn = new Part('solar_horn', 'bronze', 40);
      var pv = new Part('pv_array', 'pv_cell', 34);
      var cell = new Part('horn_cell', 'cell_pouch', 34);
      var hornR = function (t) { return 0.0125 * (1 - t * 0.86) + 0.0022; };
      [-1, 1].forEach(function (sg) {
        var rq = pt(0.86, (sg < 0 ? 157 : 23) * Math.PI / 180);
        var rz = F(rq[0], rq[1], 0) + gapAt(0.86, rq[0], rq[1]) + P.wall;
        var hp = [];
        for (var k3 = 0; k3 <= 12; k3++) {
          var t5 = k3 / 12;
          hp.push([rq[0] + sg * 0.032 * Math.pow(t5, 0.72),
                   rq[1] + 0.100 * t5 - 0.017 * t5 * t5,
                   rz - 0.004 - 0.086 * t5 * t5]);
        }
        hornPaths.push(hp);
        strip(horn, hp, hornR, 12);
        for (var pc = 0; pc < P.pvPerHorn; pc++) {
          var tp = 0.10 + 0.78 * pc / (P.pvPerHorn - 1);
          var i0 = Math.min(11, Math.floor(tp * 12));
          var a3 = hp[i0], b3 = hp[i0 + 1];
          var tg2 = unit(sub(b3, a3));
          var mid2 = [(a3[0] + b3[0]) / 2, (a3[1] + b3[1]) / 2, (a3[2] + b3[2]) / 2];
          var outw = unit(sub(mid2, headC));
          var r3 = unit(cross(tg2, outw));
          var n4 = unit(cross(r3, tg2));
          var rad = hornR(tp) * 0.94;
          pv.push(basis(r3, tg2, n4, [mid2[0] + n4[0] * rad,
                                      mid2[1] + n4[1] * rad,
                                      mid2[2] + n4[2] * rad]));
          box(pv, 0.0128, 0.0080, 0.0015);
          pv.pop();
        }
        /* curved pouch cell in the bore — the bore is too narrow for 18650 */
        if (P.hornCells) {
          for (var bc = 0; bc < 6; bc++) {
            var tb = 0.08 + 0.54 * bc / 5;
            var ib = Math.min(11, Math.floor(tb * 12));
            var ab2 = hp[ib], bb2 = hp[ib + 1];
            var tgb = unit(sub(bb2, ab2));
            var mb = [(ab2[0] + bb2[0]) / 2, (ab2[1] + bb2[1]) / 2, (ab2[2] + bb2[2]) / 2];
            var rb2 = unit(cross(tgb, unit(sub(mb, headC))));
            var nb = unit(cross(rb2, tgb));
            var rr2 = Math.max(0.0018, hornR(tb) - 0.0017);
            cell.push(basis(rb2, tgb, nb, mb));
            box(cell, rr2 * 1.42, 0.0132, rr2 * 1.08);
            cell.pop();
          }
        }
      });
      if (P.hornCells) { cellVol = volumeOf(cell); parts.push(cell); }
      parts.push(horn, pv);
    }

    /* --- crown keel --- */
    if (P.crest) {
      var crest = new Part('crest_keel', 'bronze', 40), cp = [];
      for (var ci2 = 0; ci2 <= 10; ci2++) {
        var sv4 = 0.84 + 0.145 * ci2 / 10, q9 = pt(sv4, Math.PI / 2);
        cp.push([q9[0], q9[1], F(q9[0], q9[1], 0) + gapAt(sv4, q9[0], q9[1]) + P.wall + 0.0020]);
      }
      strip(crest, cp, function (t7) { return 0.0050 * (1 - 0.5 * t7) + 0.0012; }, 10);
      parts.push(crest);

      /* meander antenna on the keel — centreline, clear of both cells */
      if (P.antenna) {
        var ant = new Part('crest_antenna', 'copper', 40);
        for (var ai = 0; ai < 9; ai++) {
          var sv5 = 0.85 + 0.128 * ai / 8, q11 = pt(sv5, Math.PI / 2);
          var az = F(q11[0], q11[1], 0) + gapAt(sv5, q11[0], q11[1]) + P.wall + 0.0046;
          ant.push(T((ai % 2 ? 1 : -1) * 0.0040, q11[1], az));
          box(ant, 0.0088, 0.0016, 0.0012);
          ant.pop();
        }
        parts.push(ant);
      }
    }

    /* --- EL-wire light channels, routed through the armour seams --- */
    if (P.lights) {
      var lite = new Part('el_wire', 'el_wire', 50);
      var clearAt = function (x, y) {
        for (var q4 = 0; q4 < holes.length; q4++) if (inHole(holes[q4], x, y, 0.0078)) return false;
        return true;
      };
      var emitRun = function (run) { if (run.length >= 4) strip(lite, run, P.wireR, 8); };
      var wireZ = function (sv, th5, q5) {
        return F(q5[0], q5[1], 0) + gapAt(sv, q5[0], q5[1]) + P.wall + seam(sv, th5) + P.wireR * 0.55;
      };
      for (var pn = 0; pn < P.panels; pn++) {
        var thp = pn / P.panels * TAU, run1 = [];
        for (var si = 0; si <= 40; si++) {
          var sv1 = 0.50 + (0.90 - 0.50) * si / 40, q6 = pt(sv1, thp);
          if (clearAt(q6[0], q6[1])) run1.push([q6[0], q6[1], wireZ(sv1, thp, q6)]);
          else { emitRun(run1); run1 = []; }
        }
        emitRun(run1);
      }
      [0.47, 0.78].forEach(function (sv2) {
        var run2 = [];
        for (var ti = 0; ti <= 160; ti++) {
          var thr = ti / 160 * TAU, q7 = pt(sv2, thr);
          if (clearAt(q7[0], q7[1])) run2.push([q7[0], q7[1], wireZ(sv2, thr, q7)]);
          else { emitRun(run2); run2 = []; }
        }
        emitRun(run2);
      });
      [[0.10, 0.90], [1.10, 1.90]].forEach(function (arc) {
        var brow = [];
        for (var bi2 = 0; bi2 <= 34; bi2++) {
          var ph = Math.PI * (arc[0] + (arc[1] - arc[0]) * bi2 / 34);
          var pe2 = holeEdge(visor, ph, 0.0072);
          brow.push([pe2[0], pe2[1], shellZ(pe2[0], pe2[1]) + P.wireR * 0.5]);
        }
        emitRun(brow);
      });
      if (P.canister) {
        var cring = [];
        for (var ri = 0; ri <= 44; ri++) {
          var ra = ri / 44 * TAU;
          cring.push(xf(base, Math.cos(ra) * P.canR * 1.01, 0.0158, Math.sin(ra) * P.canR * 1.01));
        }
        strip(lite, cring, P.wireR, 8);
      }
      hornPaths.forEach(function (hp2) {
        emitRun(hp2.map(function (q10, ii) {
          var rad3 = ((0.0125 * (1 - (ii / (hp2.length - 1)) * 0.86) + 0.0022)) * 0.82;
          var ow = unit(sub(q10, headC));
          return [q10[0] - ow[0] * rad3, q10[1] - ow[1] * rad3, q10[2] - ow[2] * rad3];
        }));
      });
      parts.push(lite);
    }

    /* --- reconstructed face form (the bust) --- */
    var bust = new Part('face_form', 'face_form', 34);
    var bT = 118, bS = 40, bRF = [], bRB = [], backZ = -0.024;
    var bpt = function (s2, th4) {
      var c = Math.cos(th4), sn = Math.sin(th4), nn = 2.5;
      var sc = c < 0 ? -1 : 1, ss = sn < 0 ? -1 : 1;
      var A = P.faceWidth * 0.575, B = sn >= 0 ? P.faceHeight * 1.06 : P.faceHeight * 0.90;
      return [s2 * A * sc * Math.pow(Math.abs(c), 2 / nn), P.midY + s2 * B * ss * Math.pow(Math.abs(sn), 2 / nn)];
    };
    for (i = 0; i <= bS; i++) {
      var bs = i / bS, rf2 = [], rb2 = [], cnt2 = i === 0 ? 1 : bT;
      for (j = 0; j < cnt2; j++) {
        var bq = bpt(bs, j / bT * TAU), fade = 1 - smooth(0.74, 1.0, bs);
        rf2.push(bust.v(bq[0], bq[1], F(bq[0], bq[1], P.relief * 2.4 * fade) * fade + 0.0005));
        rb2.push(bust.v(bq[0], bq[1], backZ));
      }
      bRF.push(rf2); bRB.push(rb2);
    }
    var BF = function (a, b) { return bRF[a][a === 0 ? 0 : ((b % bT) + bT) % bT]; };
    var BB = function (a, b) { return bRB[a][a === 0 ? 0 : ((b % bT) + bT) % bT]; };
    for (i = 0; i < bS; i++) for (j = 0; j < bT; j++) {
      if (i === 0) { bust.tri(BF(0, 0), BF(1, j), BF(1, j + 1)); bust.tri(BB(0, 0), BB(1, j + 1), BB(1, j)); }
      else { bust.quad(BF(i, j), BF(i + 1, j), BF(i + 1, j + 1), BF(i, j + 1));
             bust.quad(BB(i, j), BB(i, j + 1), BB(i + 1, j + 1), BB(i + 1, j)); }
    }
    for (j = 0; j < bT; j++) bust.quad(BF(bS, j), BB(bS, j), BB(bS, j + 1), BF(bS, j + 1));
    parts.push(bust);

    /* --- engineering metrics --- */
    var shellVol = volumeOf(shell);
    var cupPart = parts.filter(function (p2) { return p2.name === 'oronasal_cup'; })[0];
    var deadML = P.cup
      ? (Math.PI * (P.faceWidth * 0.335) * (P.faceHeight * 0.405) * 0.0105 * 0.52) * 1e6
      : (Math.PI * (P.faceWidth * 0.44) * (P.faceHeight * 0.55) * P.plenum * 0.40) * 1e6;
    var rIn = P.canR * 0.86;
    var Q = P.flowLpm / 60000;                       // m³/s
    var vAir = Q / (Math.PI * rIn * rIn);            // m/s
    var dwell = P.reactorLen / vAir;                 // s
    var wallCm2 = TAU * (rIn * 100) * (P.reactorLen * 100);
    var irr = (P.ledCount * P.ledPower * 0.55 * P.reflectance) / wallCm2;   // mW/cm²
    var dose = irr * dwell;                          // mJ/cm²
    var lrv = dose * P.kUV / 2.303;
    var pvA = P.horns ? P.pvPerHorn * 2 * (0.0128 * 0.0080) : 0;
    var loadW = (P.ledCount * P.ledPower / 1000) / 0.35 + 0.9;
    var pvW = pvA * 1000 * 0.22;
    var battWh = cellVol * 1e6 * (P.cellWhPerL / 1000);

    return {
      parts: parts.map(finalize),
      materials: MATERIALS,
      faceZ: function (x, y) { return F(x, y, 0); },
      shellZ: shellZ,
      airPath: airPath,
      params: P,
      metrics: {
        faceWidthMM: P.faceWidth * 1000,
        faceHeightMM: P.faceHeight * 1000,
        rimLengthMM: rimLength(P) * 1000,
        shellVolumeCM3: shellVol * 1e6,
        shellMassG: shellVol * 1e6 * 1.01,
        deadSpaceML: deadML,
        beadCompMM: P.sealComp * 1000,
        ledTotal: P.ledCount,
        dwellMS: dwell * 1000,
        irradiance: irr,
        uvDose: dose,
        lrv: lrv,
        pztTotal: P.pztSensors + 4 + (P.exhale ? 2 : 0),
        pvAreaCM2: pvA * 1e4,
        pvWatts: pvA * 1000 * 0.22,
        loadW: loadW,
        batteryWh: battWh,
        cellVolCM3: cellVol * 1e6,
        runtimeH: battWh / loadW,
        runtimeSolarH: battWh / Math.max(0.08, loadW - pvW),
        runtimeDutyH: battWh / Math.max(0.08, loadW * 0.45 - pvW),
        scaleCount: P.scales ? P.scaleRows * P.scaleCols : 0,
        triangles: parts.reduce(function (a, p2) { return a + p2.idx.length / 3; }, 0)
      }
    };
  }

  function rimLength(P) {
    var L = 0, prev = rimAt(0, P);
    for (var j = 1; j <= 240; j++) {
      var q = rimAt(j / 240 * TAU, P);
      L += Math.hypot(q[0] - prev[0], q[1] - prev[1]); prev = q;
    }
    return L;
  }

  /* ---------- binary STL, millimetres ---------- */
  function toSTL(parts, scale) {
    scale = scale || 1000;
    var n = 0, i;
    for (i = 0; i < parts.length; i++) n += parts[i].indices.length / 3;
    var buf = new ArrayBuffer(84 + n * 50), dv = new DataView(buf), o = 84;
    var head = 'FITMASK custom respirator - units: millimetres';
    for (i = 0; i < 80; i++) dv.setUint8(i, i < head.length ? head.charCodeAt(i) : 32);
    dv.setUint32(80, n, true);
    for (var p = 0; p < parts.length; p++) {
      var pos = parts[p].positions, idx = parts[p].indices;
      for (var f = 0; f < idx.length; f += 3) {
        var a = idx[f]*3, b = idx[f+1]*3, c = idx[f+2]*3;
        var A = [pos[a]*scale, pos[a+1]*scale, pos[a+2]*scale];
        var B = [pos[b]*scale, pos[b+1]*scale, pos[b+2]*scale];
        var C = [pos[c]*scale, pos[c+1]*scale, pos[c+2]*scale];
        var nv = unit(cross(sub(B, A), sub(C, A)));
        dv.setFloat32(o, nv[0], true); dv.setFloat32(o+4, nv[1], true); dv.setFloat32(o+8, nv[2], true);
        dv.setFloat32(o+12, A[0], true); dv.setFloat32(o+16, A[1], true); dv.setFloat32(o+20, A[2], true);
        dv.setFloat32(o+24, B[0], true); dv.setFloat32(o+28, B[1], true); dv.setFloat32(o+32, B[2], true);
        dv.setFloat32(o+36, C[0], true); dv.setFloat32(o+40, C[1], true); dv.setFloat32(o+44, C[2], true);
        dv.setUint16(o+48, 0, true); o += 50;
      }
    }
    return buf;
  }

  /* ================= manifold validation =================
     Track 4. Until now the geometry was closed BY CONSTRUCTION but never closed
     BY VERIFICATION, and the print guide said so. This closes that.

     WHY IT WELDS FIRST. finalize() splits vertices along crease edges so hard
     edges shade correctly, so two triangles sharing a geometric edge routinely
     hold different indices. Checking edges by index would report a hole at
     every crease — nonsense. Welding by quantised position is also exactly what
     a slicer does when it reads an STL, where every triangle is standalone and
     shares nothing at all. So this validates the thing the slicer will actually
     see, not an intermediate representation.

     Tolerance defaults to 1e-7 m (0.1 um): far below any printer's resolution,
     far above float32 noise from the STL round-trip.

     A part is watertight and consistently wound iff every directed edge (a->b)
     occurs exactly once and its opposite (b->a) also occurs exactly once. That
     single test catches holes, duplicate faces and flipped winding together. */
  function validatePart(part, tol) {
    tol = tol || 1e-7;
    var pos = part.positions, idx = part.indices;
    var inv = 1 / tol, nv = pos.length / 3;
    var weld = new Int32Array(nv), i;

    /* Weld with a numeric spatial hash rather than string keys. The obvious
       "qx_qy_qz" string version cost 760 ms on a default build — six times the
       whole geometry rebuild — because it allocates a string per vertex and per
       edge. Hashing to an int and resolving collisions by comparing the
       quantised coordinates is the same answer for ~1/20th of the time. */
    var qx = new Int32Array(nv), qy = new Int32Array(nv), qz = new Int32Array(nv);
    for (i = 0; i < nv; i++) {
      qx[i] = Math.round(pos[i*3] * inv);
      qy[i] = Math.round(pos[i*3+1] * inv);
      qz[i] = Math.round(pos[i*3+2] * inv);
    }
    var buckets = new Map(), wn = 0;
    for (i = 0; i < nv; i++) {
      var h = (qx[i] * 73856093 ^ qy[i] * 19349663 ^ qz[i] * 83492791) | 0;
      var bucket = buckets.get(h), found = -1;
      if (bucket === undefined) { bucket = []; buckets.set(h, bucket); }
      for (var bi = 0; bi < bucket.length; bi++) {
        var o = bucket[bi];
        if (qx[o] === qx[i] && qy[o] === qy[i] && qz[o] === qz[i]) { found = weld[o]; break; }
      }
      if (found < 0) { found = wn++; bucket.push(i); }
      weld[i] = found;
    }

    /* Directed-edge tally keyed on u*S+v. S is the welded vertex count, so the
       key is unique and stays an exact integer well inside 2^53. */
    var S = wn + 1, edges = new Map(), degenerate = 0, nf = idx.length / 3, f;
    for (f = 0; f < nf; f++) {
      var a = weld[idx[f*3]], b = weld[idx[f*3+1]], c = weld[idx[f*3+2]];
      /* A triangle whose welded corners collapse has no area and no edges to
         match. Slicers drop these silently; count them, do not let them skew
         the edge tally. */
      if (a === b || b === c || a === c) { degenerate++; continue; }
      var k1 = a * S + b, k2 = b * S + c, k3 = c * S + a;
      edges.set(k1, (edges.get(k1) || 0) + 1);
      edges.set(k2, (edges.get(k2) || 0) + 1);
      edges.set(k3, (edges.get(k3) || 0) + 1);
    }

    var boundary = 0, nonManifold = 0, duplicate = 0;
    edges.forEach(function (count, k) {
      var u = Math.floor(k / S), v = k - u * S;
      if (count > 1) duplicate += count - 1;          /* same edge, same direction: overlapping faces */
      var opp = edges.get(v * S + u) || 0;
      if (opp === 0) boundary += count;               /* nothing closes this edge: a hole */
      /* count each undirected edge once — only from the (u<v) side */
      if (u < v && count + opp > 2) nonManifold++;    /* >2 faces meet on one edge */
    });

    /* Signed volume. Positive means outward-facing winding; a negative result on
       a closed shell means the part is inside-out and will slice as a void. */
    var vol = 0;
    for (f = 0; f < nf; f++) {
      var p0 = idx[f*3]*3, p1 = idx[f*3+1]*3, p2 = idx[f*3+2]*3;
      vol += (pos[p0] * (pos[p1+1]*pos[p2+2] - pos[p1+2]*pos[p2+1])
            - pos[p0+1] * (pos[p1]*pos[p2+2] - pos[p1+2]*pos[p2])
            + pos[p0+2] * (pos[p1]*pos[p2+1] - pos[p1+1]*pos[p2])) / 6;
    }

    var closed = boundary === 0 && nonManifold === 0 && duplicate === 0;
    return {
      name: part.name,
      ok: closed && vol > 0,
      closed: closed,
      triangles: nf,
      vertices: pos.length / 3,
      welded: wn,
      boundaryEdges: boundary,
      nonManifoldEdges: nonManifold,
      duplicateFaces: duplicate,
      degenerateFaces: degenerate,
      volumeCM3: vol * 1e6,
      inverted: closed && vol < 0
    };
  }

  /* Validate every part. Returns { ok, parts:[…], failed:[names] }. */
  function validate(parts, tol) {
    var out = [], failed = [], i;
    for (i = 0; i < parts.length; i++) {
      var r = validatePart(parts[i], tol);
      out.push(r);
      if (!r.ok) failed.push(r.name);
    }
    return { ok: failed.length === 0, parts: out, failed: failed };
  }

  root.MaskGeometry = { build: build, toSTL: toSTL, validate: validate,
                        validatePart: validatePart, DEFAULTS: DEFAULTS, MATERIALS: MATERIALS };
})(typeof window !== 'undefined' ? window : this);