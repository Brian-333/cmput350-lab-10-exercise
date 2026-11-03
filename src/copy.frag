#version 120 

uniform sampler2D toCopy;

void main() {
    gl_FragColor = texture2D(toCopy, gl_TexCoord[0].xy);
}
