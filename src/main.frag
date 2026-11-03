#version 120 

// (way more precision than a float can actually store...)
#define LOG_2 0.6931471805599453094172321214581765680755001

// start using these antialiasing values once you start (c)
#define AA 2
const int TOTAL_SAMPLES = AA * AA;
const float ESCAPE_RADIUS = 4.0;
const float TRUE_MAX_ITERS_F = 16384.0;

uniform vec2 c;
uniform int MAX_ITERS;
uniform vec2 windowSizePixels;
uniform vec2 camCenterWorld;
uniform float camWorldUnitsPerPixel;

// reprojection (1d) may require extra uniforms here...
uniform vec2 previousWindowSizePixels;
uniform vec2 previousCamCenterWorld;
uniform float previousCamWorldUnitsPerPixel;
uniform sampler2D previousFrame;
uniform int cChanged;

// Use this to get a color from your smoothed Julia set escape times.
vec4 colorTime(float t) {
    return vec4(0.5 + 0.5 * cos(  0.1 * (t) + vec3(0.f, 0.35, 0.7)), 1.f);
}

struct EscapeTime {
    float iters;
    bool isInf;
};

// Escape time of iterating z^2 + c
EscapeTime escapeTimeSmooth(vec2 z) {
    for (int i = 0; i < MAX_ITERS; ++i) {
        z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
        float r = length(z);
        if (r > ESCAPE_RADIUS) {
            // n = i+1, smoothed = n + 1 - ln(ln|z_n|)/ln2
            return EscapeTime(float(i + 1) + 1.0 - log(log(r)) / LOG_2, false);
        }
    }
    return EscapeTime(0.0, true);
}


vec2 windowToWorld(vec2 windowCoords) {
    return camCenterWorld + (windowCoords - 0.5 * windowSizePixels) * camWorldUnitsPerPixel;
}

// For reprojection
vec2 worldToOldWindow(vec2 worldCoords) {
    return (worldCoords - previousCamCenterWorld) / previousCamWorldUnitsPerPixel
         + 0.5 * previousWindowSizePixels;
}

// For SSAA
// Given (dx, dy) in [0, AA)^2, suppose the unit square [0, 1)^2 was cut up into AA equal
// partitions along each dimension. delta((dx, dy)) returns the center of the sub-square
// which is in the dy'th row and dx'th column (both 0-indexed).
vec2 delta(vec2 dxy) {
    return (dxy + 0.5) / float(AA);
}

vec4 sampleColor(vec2 samplePixel) {
    vec2 world = windowToWorld(samplePixel);
    EscapeTime t = escapeTimeSmooth(world);
    vec4 newColor = t.isInf ? vec4(0.0, 0.0, 0.0, 1.0) : colorTime(t.iters);

    vec2 oldPx = worldToOldWindow(world);
    bool inOldView = oldPx.x >= 0.0 && oldPx.y >= 0.0
                  && oldPx.x < previousWindowSizePixels.x
                  && oldPx.y < previousWindowSizePixels.y;

    if (!inOldView || cChanged != 0) {
        return newColor;
    }

    vec2 oldUV = oldPx / previousWindowSizePixels;
    vec4 oldColor = texture2D(previousFrame, oldUV);

    // Prefer old data just after a move (low MAX_ITERS / low escape time).
    // Floor alpha by MAX_ITERS so once we finish refining while stopped,
    // alpha -> 1 and we stop re-filtering the previous frame (avoids blur).
    float alpha = t.isInf ? 0.0 : clamp(t.iters / TRUE_MAX_ITERS_F, 0.0, 1.0);
    alpha = max(alpha, clamp(float(MAX_ITERS) / TRUE_MAX_ITERS_F, 0.0, 1.0));
    return mix(oldColor, newColor, alpha);
}

void main() {
    vec2 pixelCorner = floor(gl_FragCoord.xy);
    vec4 sum = vec4(0.0);

    for (int dy = 0; dy < AA; ++dy) {
        for (int dx = 0; dx < AA; ++dx) {
            vec2 samplePixel = pixelCorner + delta(vec2(float(dx), float(dy)));
            sum += sampleColor(samplePixel);
        }
    }
    gl_FragColor = sum / float(TOTAL_SAMPLES);
}
