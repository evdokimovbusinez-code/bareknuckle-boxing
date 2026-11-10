
/* ───────── shared template state ───────── */
const HEAD = { C: new V3(), R: new V3(), hairRoots: [], beardRoots: [], restInvT: new M4(), restInv: new M4() };
const BODY = { fullIndex: null, groups: null, crotchY: 0.87, gen: null };
const SHORTS = { waistY: 1.04, hemY: 0.685 };
const T = {};
let ccBones = {};
const bpos = (name, v) => v.setFromMatrixPosition(ccBones[name].matrixWorld);
const HAIR_NB = THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', '');
const _HT = {};
const hairTex = kind => _HT[kind] || (_HT[kind] = hairTexture(kind));
function hairMat(kind) {
  const mat = new THREE.MeshPhysicalMaterial({ map: hairTex(kind), vertexColors: true, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.62, specularIntensity: 0.35, specularColor: new THREE.Color('#8a6a50'), envMapIntensity: 0.15 });
  // card normals are set per vertex (outward from the head); keep them on both faces
  mat.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', HAIR_NB); };
  mat.customProgramCacheKey = () => 'hair-cards';
  return mat;
}
const HEAD_FRAG = `#include <map_fragment>
 float hs = hairStrands( vHairUV );
 float hairCover = max( max( vScalp, smoothstep( 0.0, 0.25, vHairUV.y - mix( 0.3, 0.6, smoothstep( 1.3, 0.4, abs( vHairUV.x ) ) ) ) ) * uHairAmt, vStub * uStubAmt );   // the crown is always under hair (no skin showing between the strands)
 diffuseColor.rgb = mix( diffuseColor.rgb, uHair * ( 0.45 + 1.1 * hs ), hairCover );
 float fLon = vHairUV.x, fLat = vHairUV.y;
 float faceM = smoothstep( 1.3, 0.75, abs( fLon ) ) * smoothstep( -1.05, -0.6, fLat ) * smoothstep( 0.5, 0.15, fLat );
 float bz = hNoise( vec2( fLon * 4.0 + 1.7, fLat * 5.0 ) ) * 0.7 + hNoise( vec2( fLon * 11.0, fLat * 13.0 + 4.0 ) ) * 0.3;
 float br = smoothstep( 1.12 - uDmg * 0.42, 1.22 - uDmg * 0.36, bz + 0.3 ) * faceM * smoothstep( 0.03, 0.2, uDmg );
 diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 0.55, 0.22, 0.3 ), br * 0.6 );
 diffuseColor.rgb = mix( diffuseColor.rgb, max( diffuseColor.rgb, diffuseColor.rgb * 2.6 ), vLidK * 0.85 );   // the crease shadow baked in the texture, unfolded
 float mWet; diffuseColor.rgb = skinMarks( diffuseColor.rgb, mWet );
 vec4 WW = wounds();
 diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 0.9, 0.5, 0.52 ), clamp( WW.w, 0.0, 1.0 ) * 0.5 );   // swollen, inflamed skin
 // blood: a thin film diluted by sweat stains the skin translucent red; where it runs thick it is an opaque, deep red layer
 diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 0.78, 0.1, 0.09 ), gFilm * ( 1.0 - 0.6 * WW.z ) );
 vec3 bloodC = mix( mix( vec3( 0.33, 0.012, 0.016 ), vec3( 0.13, 0.002, 0.007 ), smoothstep( 0.3, 1.0, gThick ) ), vec3( 0.075, 0.016, 0.012 ), WW.z );   // thin → thick, fresh → drying
 diffuseColor.rgb = mix( diffuseColor.rgb, bloodC, WW.x * 0.95 );
 diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.06, 0.0, 0.004 ), WW.y );                                          // the open cut
 gDrop = sweatBeads( vMapUv, uSweat * ( 1.0 - hairCover ) ); gH += gDrop * 0.00016 * ( 1.0 - WW.x );
 float bWet = clamp( max( WW.x * ( 1.0 - 0.85 * WW.z ), gFilm * 0.7 ) + WW.y + mWet, 0.0, 1.0 );
`;
/* ───────── flesh: soft-tissue impact (dent + surface wave) and swelling, displaced in bind space before skinning ───────── */
const FLESH_VDECL = `uniform float uFT;
uniform float uU;
uniform float uFleshOn;
uniform vec4 uImp[2];
uniform vec4 uImpD[2];
uniform vec4 uSw[6];
uniform vec4 uNB;
uniform vec4 uNBD;
attribute vec2 aLid;
uniform vec3 uEyeL;
uniform vec3 uEyeR;
uniform vec3 uLidAx;
uniform vec4 uLid;
uniform vec2 uEyeSw;
attribute vec4 aFace;
uniform vec4 uEmo;
uniform vec4 uEmo2;
uniform vec3 uFUp;
uniform vec3 uFFw;
uniform vec3 uFMid;
varying vec3 vBP;
varying vec3 vBN;
varying float vLidK;
varying float vEyeSw;
// eyelids (the rig has no lid bones): lid skin turns about the eyeball centre on the lateral axis, so it slides over the eye
vec3 lidRot( vec3 v, float a ) { float c = cos( a ), s = sin( a ); return v * c + cross( uLidAx, v ) * s + uLidAx * dot( uLidAx, v ) * ( 1.0 - c ); }
vec3 fleshOff( vec3 p, vec3 n ) {
  vec3 o = vec3( 0.0 );
  for ( int i = 0; i < 2; i++ ) {
    vec4 P = uImp[i]; float age = uFT - P.w; if ( P.w < 0.0 || age < 0.0 || age > 1.2 ) continue;
    vec4 D = uImpD[i]; float d = length( p - P.xyz ) / uU;
    // the fist pushes the tissue in (r ≈ 3 cm) and it springs back with a small overshoot
    float env = age < 0.03 ? age / 0.03 : exp( -( age - 0.03 ) * 16.0 ) * cos( ( age - 0.03 ) * 42.0 );
    o += D.xyz * ( min( D.w, 1.2 ) * 0.012 * env * exp( -d * d / 0.0009 ) ) * uU;
    // a surface wave runs out across the face (≈1.3 m/s, 2.5 cm wavelength) and dies away
    float front = age * 1.3;
    o += n * ( D.w * 0.0026 * sin( ( d - front ) * 250.0 ) * exp( -age * 7.0 ) * exp( -d / 0.06 ) * smoothstep( front + 0.004, front - 0.008, d ) * smoothstep( 0.0, 0.01, d ) ) * uU;
  }
  for ( int i = 0; i < 6; i++ ) { vec4 S = uSw[i]; if ( S.w <= 0.0 ) continue; float d = length( p - S.xyz ) / uU; o += n * ( S.w * 0.0085 * exp( -d * d / 0.0006 ) ) * uU; }
  if ( uNB.w > 0.0 ) { float d = length( p - uNB.xyz ) / uU; o += uNBD.xyz * ( uNB.w * 0.006 * exp( -d * d / 0.00022 ) ) * uU; }   // broken nose: the cartilage sits off-centre
  return o;
}
`;
const FLESH_NORMAL = `#include <beginnormal_vertex>
 vBP = position; vBN = objectNormal;
 vec3 fOff = vec3( 0.0 ); vEyeSw = 0.0;
 // expression (the rig has no face bones or blend shapes): brows, mouth corners and lips are moved by painted weights
 if ( dot( abs( aFace ), vec4( 1.0 ) ) > 0.0 ) {
   float cm = uU * 0.01, sd = sign( dot( position - uFMid, uLidAx ) );
   fOff += uFUp * ( -uEmo.x * 0.42 * aFace.x + uEmo.y * 0.8 * aFace.y ) * cm - uLidAx * sd * uEmo.x * 0.18 * aFace.y * cm;   // brows down + together / inner brows up
   float c = abs( aFace.z ), cs = sign( aFace.z );
   fOff += ( uLidAx * cs * 0.28 * uEmo.z - uFFw * 0.18 * uEmo.z + uFUp * 0.32 * uEmo.w ) * c * cm;                              // mouth corners: pulled back / up or down
   fOff += uFUp * ( max( aFace.w, 0.0 ) * uEmo2.x * 0.28 - max( -aFace.w, 0.0 ) * uEmo2.y * 0.24 ) * cm;                      // upper lip up (teeth bared) / lower lip down
 }
 if ( aLid.x + aLid.y > 0.0 ) {
   bool left = distance( position, uEyeL ) < distance( position, uEyeR ); vec3 c = left ? uEyeL : uEyeR;
   float esw = left ? uEyeSw.x : uEyeSw.y; vEyeSw = ( aLid.x + aLid.y * 1.2 ) * esw;
   float a = aLid.x * ( left ? uLid.x : uLid.y ) * 0.56 - aLid.y * ( left ? uLid.z : uLid.w ) * 0.2;
   vec3 rp = lidRot( position - c, a ); fOff = rp + c - position;
   // a closed lid is a dome over the eyeball: bend its normal toward the radial direction (the crease normals would light it like a hole)
   float k = clamp( aLid.x * ( left ? uLid.x : uLid.y ) * 1.4, 0.0, 1.0 ); vLidK = k;
   objectNormal = normalize( mix( lidRot( objectNormal, a ), normalize( rp ) * length( objectNormal ), k * 0.85 ) );
   fOff += normalize( rp ) * vEyeSw * 0.0075 * uU;   // haematoma: the lids and the cheek under the eye puff up
 } else vLidK = 0.0;
 if ( uFleshOn > 0.5 ) {
   vec3 n0 = normalize( objectNormal );
   fOff += fleshOff( position, n0 );
   vec3 t1 = normalize( cross( n0, abs( n0.y ) < 0.9 ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 ) ) ), t2 = cross( n0, t1 ); float e = 0.004 * uU;
   float hx = dot( fleshOff( position + t1 * e, n0 ) - fleshOff( position - t1 * e, n0 ), n0 ), hy = dot( fleshOff( position + t2 * e, n0 ) - fleshOff( position - t2 * e, n0 ), n0 );
   objectNormal = normalize( n0 - ( t1 * hx + t2 * hy ) / ( 2.0 * e ) );
 }`;
/* wounds (head only): cuts and nose bleeds as decals projected on the skin around each source, with a rivulet that runs along gravity */
const SKIN_FDECL = `uniform float uFT;
uniform float uU;
uniform float uSweat;
uniform vec4 uBr[10];
uniform vec4 uBrT[10];
uniform vec4 uSm[28];
uniform vec4 uSmD[28];
varying vec3 vBP;
varying vec3 vBN;
varying float vLidK;
varying float vEyeSw;
uniform float uDropS;
float gFilm = 0.0, gThick = 0.0, gH = 0.0, gDrop = 0.0;
// bump from a height field (metres) given in screen space: wet blood and sweat beads catch the light at their edges
vec3 wetBump( vec3 pos, vec3 n, float h ) {
  // in millimetres (keeps the cross products far from float underflow) and guarded: a zero/NaN result falls back to n —
  // one NaN pixel here becomes a black hole the size of the screen after the bloom passes
  vec2 dh = vec2( dFdx( h ), dFdy( h ) ) * 1000.0; if ( dot( dh, dh ) < 1e-10 ) return n;
  vec3 sx = dFdx( pos ) * 1000.0, sy = dFdy( pos ) * 1000.0, r1 = cross( sy, n ), r2 = cross( n, sx ); float det = dot( sx, r1 );
  if ( abs( det ) < 1e-8 ) return n;
  vec3 r = abs( det ) * n - sign( det ) * ( dh.x * r1 + dh.y * r2 ); float l = dot( r, r );
  if ( !( l > 1e-12 ) || l > 1e12 ) return n;
  return r * inversesqrt( l );
}
float skN2( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
// sweat: beads (domes 1–2.5 mm) scattered by a cell pattern in texture space, denser and bigger as he sweats; the film between them is glossy
float sweatBeads( vec2 uv, float amt ) {
  if ( amt <= 0.01 ) return 0.0;
  vec2 q = uv * uDropS, i = floor( q ), f = fract( q ); float h = 0.0;
  for ( int y = -1; y <= 1; y++ ) for ( int x = -1; x <= 1; x++ ) {
    vec2 c = vec2( float( x ), float( y ) ), id = i + c; float r0 = skN2( id );
    if ( r0 > amt * 0.32 ) continue;
    vec2 o = vec2( skN2( id + 3.1 ), skN2( id + 7.7 ) ); float rad = 0.11 + 0.16 * skN2( id + 1.3 ) * amt;
    float d = length( c + o - f ) / rad, e = max( 1.0 - d * d, 0.0 ); h = max( h, e * e );
  }
  return h * smoothstep( 0.35, 0.12, length( fwidth( q ) ) );   // beads smaller than a few pixels fade into the film (no sparkle)
}
float skN( vec3 p ) { return fract( sin( dot( p, vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 ); }
float skVN( vec3 p ) { vec3 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( skN( i ), skN( i + vec3( 1, 0, 0 ) ), f.x ), mix( skN( i + vec3( 0, 1, 0 ) ), skN( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
              mix( mix( skN( i + vec3( 0, 0, 1 ) ), skN( i + vec3( 1, 0, 1 ) ), f.x ), mix( skN( i + vec3( 0, 1, 1 ) ), skN( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z ); }
// contusions: capillaries burst under the skin — a red flush within seconds, darkening to purple-blue as the blood pools and deoxygenates
vec3 bruises( vec3 c ) {
  for ( int i = 0; i < 10; i++ ) {
    vec4 B = uBr[i]; if ( B.w <= 0.0 ) continue;
    float d = length( vBP - B.xyz ) / uU, n = skVN( vBP / uU * 90.0 ) * 0.5 + skVN( vBP / uU * 260.0 ) * 0.25;
    float m = smoothstep( 0.045 * ( 0.6 + 0.6 * B.w ), 0.0, d * ( 0.75 + 0.5 * n ) ) * min( B.w, 1.0 );
    float age = uFT - uBrT[i].x, dark = smoothstep( 8.0, 40.0, age );
    vec3 tint = mix( vec3( 1.0, 0.55, 0.55 ), vec3( 0.52, 0.3, 0.5 ), dark );
    c = mix( c, c * tint, m * 0.75 );
  }
  return c;
}
// blood smeared or run onto skin (from the opponent's face onto the knuckles, drips running down the chest)
vec4 smears() {
  float a = 0.0, dry = 0.0;
  for ( int i = 0; i < 28; i++ ) {
    vec4 S = uSm[i]; if ( S.w <= 0.0 ) continue;
    vec3 v = ( vBP - S.xyz ) / uU; vec4 D = uSmD[i]; float al = dot( v, D.xyz ), lat = length( v - D.xyz * al );
    float n = skVN( vBP / uU * 140.0 + S.xyz );
    float blob = smoothstep( 0.012 + 0.012 * S.w, 0.002, length( v ) * ( 0.7 + 0.6 * n ) );
    float ww = ( 0.0035 + 0.0025 * n ) * ( 1.0 - 0.4 * clamp( al / max( D.w, 1e-3 ), 0.0, 1.0 ) );
    float streak = smoothstep( ww, ww * 0.35, lat ) * smoothstep( -0.003, 0.0, al ) * smoothstep( D.w, D.w - 0.01, al );
    float film = smoothstep( 0.03 + 0.02 * S.w, 0.004, length( v ) * ( 0.7 + 0.6 * n ) ) * 0.6 + smoothstep( ww * 3.0, ww, lat ) * smoothstep( -0.003, 0.0, al ) * smoothstep( D.w, D.w - 0.01, al ) * 0.5;
    float b = max( blob, streak ) * min( S.w, 1.0 );
    a = max( a, b ); dry = max( dry, film * min( S.w, 1.0 ) );
  }
  return vec4( a, dry, 0.0, 0.0 );   // x: blood, y: diluted film
}
vec3 skinMarks( vec3 c, out float wet ) {
  c = bruises( c );
  // black eye: periorbital haematoma — swollen, tight and shiny, red-purple
  c = mix( c, c * vec3( 0.55, 0.25, 0.4 ), clamp( vEyeSw, 0.0, 1.0 ) * 0.8 );
  vec4 S = smears(); c = mix( c, c * vec3( 0.7, 0.08, 0.07 ), S.y ); c = mix( c, vec3( 0.26, 0.01, 0.014 ), S.x * 0.9 );
  gH += S.x * 0.0004 + S.y * 0.00012;
  wet = max( S.x * 0.85, S.y * 0.5 ) + clamp( vEyeSw, 0.0, 1.0 ) * 0.3;
  return c;
}
`;
const WOUND_FDECL = `
uniform vec4 uWP[8];
uniform vec4 uWD[8];
uniform vec4 uWN[8];
uniform vec4 uWT[8];
uniform vec4 uSw[6];
vec4 wounds() {
  float bl = 0.0, ct = 0.0, dry = 0.0, sw = 0.0;
  vec3 bn = normalize( vBN );
  for ( int i = 0; i < 8; i++ ) {
    vec4 P = uWP[i]; if ( P.w < -1e3 ) continue;
    float age = max( uFT - P.w, 0.0 ); vec4 D = uWD[i], N = uWN[i], Tg = uWT[i];
    vec3 v = ( vBP - P.xyz ) / uU; float dn = dot( v, N.xyz ); vec3 vt = v - N.xyz * dn;
    float df = smoothstep( 0.032, 0.014, abs( dn ) ) * smoothstep( -0.35, 0.1, dot( bn, N.xyz ) );
    if ( df <= 0.0 ) continue;
    vec3 fl = D.xyz - N.xyz * dot( D.xyz, N.xyz ); float fll = length( fl ); vec3 fd = fll > 1e-3 ? fl / fll : normalize( cross( N.xyz, vec3( 1.0, 0.0, 0.0 ) ) );
    vec3 sd = cross( fd, N.xyz );
    float al = dot( vt, fd ), lat = dot( vt, sd ), sev = N.w, L = D.w * mix( 0.25, 1.0, clamp( fll * 2.0, 0.0, 1.0 ) );
    float wig = 0.0016 * sin( al * 170.0 + P.w * 7.0 ) + 0.0009 * sin( al * 430.0 + P.w * 3.0 );
    float nw = skVN( vec3( al * 260.0, P.w * 5.0, sev * 3.0 ) );
    float w = ( 0.0022 + 0.0034 * sev ) * ( 1.0 - 0.45 * clamp( al / max( L, 1e-3 ), 0.0, 1.0 ) ) * ( 0.7 + 0.6 * nw );
    float run = smoothstep( -0.003, 0.0, al ) * smoothstep( L + 0.0005, L - 0.003, al );
    float s1 = smoothstep( w, w * 0.3, abs( lat - wig ) ) * run;
    gFilm = max( gFilm, smoothstep( w * 3.2, w * 0.8, abs( lat - wig ) ) * run * df * 0.75 * smoothstep( 0.0, 0.3, age ) );
    gFilm = max( gFilm, smoothstep( 0.016 + 0.012 * sev, 0.003, length( vt ) ) * df * 0.8 );
    float br = fract( P.w * 3.7 ) > 0.5 ? 1.0 : -1.0;
    float s2 = sev > 0.45 ? smoothstep( w * 0.55, w * 0.15, abs( lat - wig - br * 0.007 * smoothstep( 0.008, 0.035, al ) ) ) * smoothstep( 0.008, 0.012, al ) * smoothstep( L * 0.75, L * 0.75 - 0.003, al ) : 0.0;
    float bead = smoothstep( 0.0026 + 0.0018 * sev, 0.0008, length( vt - fd * L ) ) * step( 0.006, L );
    float pool = smoothstep( 0.0035 + 0.006 * sev, 0.0008, length( vt ) );
    float b = max( max( s1, s2 ), max( bead, pool ) ) * df * smoothstep( 0.0, 0.08, age );
    bl = max( bl, b ); dry = max( dry, b * smoothstep( 8.0, 45.0, age ) );
    float th = max( max( bead, pool ), s1 * ( 1.0 - clamp( abs( lat - wig ) / w, 0.0, 1.0 ) ) ) * df;   // thickness: domed across the stream, beads at the tip
    gThick = max( gThick, th ); gH = max( gH, th * ( 0.0003 + 0.0005 * sev ) * ( 1.0 - 0.7 * smoothstep( 8.0, 45.0, age ) ) );
    if ( Tg.w > 0.0 ) {
      float c1 = dot( vt, Tg.xyz ), cn = abs( dot( vt, cross( Tg.xyz, N.xyz ) ) ) + 0.0002 * sin( c1 * 900.0 );
      float open = smoothstep( 0.0, 0.12, age ) * ( 0.0009 + 0.0009 * sev ) * ( 1.0 - 0.6 * smoothstep( Tg.w * 0.2, Tg.w * 0.5, abs( c1 ) ) );
      ct = max( ct, smoothstep( open, open * 0.25, cn ) * smoothstep( Tg.w * 0.5, Tg.w * 0.5 - 0.002, abs( c1 ) ) * df );
      sw = max( sw, smoothstep( 0.016, 0.0, length( vt ) ) * df * 0.8 );
    }
  }
  for ( int i = 0; i < 6; i++ ) { vec4 S = uSw[i]; if ( S.w <= 0.0 ) continue; float d = length( vBP - S.xyz ) / uU; sw = max( sw, S.w * exp( -d * d / 0.0005 ) ); }
  return vec4( bl, ct, dry, sw );
}
`;

function skinify(mat, u, fu) {
  mat.onBeforeCompile = s => {
    s.fragmentShader = s.fragmentShader.replace('#include <lights_physical_pars_fragment>', SSS_CHUNK);
    // skin under clothes is not drawn (the clothes are shells around it)
    s.fragmentShader = 'varying vec3 vGH;\nuniform vec4 uGear;\nuniform float uGearT;\nuniform float uGlv;\n' + s.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
 { float h = vGH.x, R = vGH.y, a = vGH.z;
   if ( ( uGear.x > 0.5 && R < 2.5 && h > uGear.x && h < ${(0).toFixed(1)} + GEAR_TOP ) || ( uGear.y > 0.0 && R < 1.5 && h < uGear.y - 1.0 ) || ( uGear.z > 0.5 && ( ( R > 1.5 && R < 2.5 && h > max( GEAR_TOP - 7.0, uGearT ) && h < uGear.z ) || ( R > 2.5 && R < 4.5 && a < uGear.w - 0.05 && h < GEAR_NECK + 3.0 ) ) ) || ( R > 3.5 && ( uGlv > 1.5 ? a > 1.81 && a < 2.53 : uGlv > 0.5 && a > 1.635 ) ) ) discard; }   // hands: inside a boxing glove (up to the cuff's rim) / under an MMA glove`).replace(/GEAR_TOP/g, GEAR.top.toFixed(2)).replace(/GEAR_NECK/g, GEAR.neck.toFixed(2));
    Object.assign(s.uniforms, fu); s.uniforms.uDropS = { value: u ? 190 : 300 };
    s.vertexShader = 'attribute vec3 aGH;\nvarying vec3 vGH;\n' + FLESH_VDECL + s.vertexShader.replace('#include <beginnormal_vertex>', FLESH_NORMAL + '\n vGH = aGH;').replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed += fOff' + (u ? ' * ( 1.0 - 0.92 * clamp( aScalp, 0.0, 1.0 ) );' : ';') + (u ? '\n vScalp = aScalp; vStub = aStub; vHairUV = aHairUV;' : ''));
    if (u) {
      Object.assign(s.uniforms, u);
      s.vertexShader = 'attribute float aScalp;\nattribute float aStub;\nattribute vec2 aHairUV;\nvarying float vScalp;\nvarying float vStub;\nvarying vec2 vHairUV;\n' + s.vertexShader;
      s.fragmentShader = 'uniform vec3 uHair;\nuniform float uHairAmt;\nuniform float uStubAmt;\nuniform float uDmg;\nvarying float vScalp;\nvarying float vStub;\nvarying vec2 vHairUV;\n' + SKIN_FDECL + WOUND_FDECL + HAIR_NOISE + s.fragmentShader
        .replace('#include <map_fragment>', HEAD_FRAG)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix( roughnessFactor, 0.9, hairCover );\n roughnessFactor = mix( roughnessFactor * ( 1.0 - 0.32 * uSweat ), 0.07, max( bWet, gDrop * 0.9 ) );')
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n normal = wetBump( -vViewPosition, normal, gH );')
        .replace('#include <clearcoat_normal_fragment_begin>', '#include <clearcoat_normal_fragment_begin>\n clearcoatNormal = wetBump( -vViewPosition, clearcoatNormal, gH );')
        .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n material.clearcoat = max( material.clearcoat * ( 1.0 - hairCover ), 0.9 * bWet + 0.6 * gDrop + 0.3 * uSweat * ( 1.0 - hairCover ) );\n material.clearcoatRoughness = mix( material.clearcoatRoughness, 0.03, max( bWet, gDrop ) );');
    } else {
      s.fragmentShader = SKIN_FDECL + s.fragmentShader
        .replace('#include <map_fragment>', '#include <map_fragment>\n float mWet; diffuseColor.rgb = skinMarks( diffuseColor.rgb, mWet );\n gDrop = sweatBeads( vMapUv, uSweat ); gH += gDrop * 0.00016 * ( 1.0 - mWet );')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix( roughnessFactor * ( 1.0 - 0.32 * uSweat ), 0.08, max( mWet, gDrop * 0.9 ) );')
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n normal = wetBump( -vViewPosition, normal, gH );')
        .replace('#include <clearcoat_normal_fragment_begin>', '#include <clearcoat_normal_fragment_begin>\n clearcoatNormal = wetBump( -vViewPosition, clearcoatNormal, gH );')
        .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n material.clearcoat = max( material.clearcoat, 0.3 * uSweat + 0.9 * mWet + 0.6 * gDrop );\n material.clearcoatRoughness = mix( material.clearcoatRoughness, 0.03, max( mWet, gDrop ) );');
    }
  };
  mat.customProgramCacheKey = () => u ? 'skin-head-f' : 'skin-sss-f';
  return mat;
}
