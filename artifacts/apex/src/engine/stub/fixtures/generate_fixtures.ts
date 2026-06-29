// Utility to understand the synthetic fixture generation logic (not run at runtime)
// Cycling: 300 frames at 30 fps = 10 seconds of pedaling
// Tennis service: 90 frames at 30 fps = 3 seconds (3 phases × 30 frames)
//
// All landmarks are image-normalized coords [0,1], y-down (MediaPipe convention)
// Confidence = 1.0 for all required landmarks, 0.6 for others

// Stick figure approximate positions for a person in sagittal right view:
// The person occupies roughly x: 0.3-0.7, y: 0.1-0.9 of the frame

// Key joints (y-down):
// nose:       x=0.5, y=0.15
// shoulder:   x=0.5, y=0.3
// elbow:      computed from shoulder + arm vector
// wrist:      computed from elbow + forearm vector
// hip:        x=0.5, y=0.55
// knee:       x=0.5, y=0.72
// ankle:      x=0.5, y=0.88

export {}
