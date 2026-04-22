let isAudioInitialized = false;

document.body.addEventListener('click', () => {
    // Prevent multiple clicks from starting multiple overlapping tracks
    if (isAudioInitialized) return;
    isAudioInitialized = true;

    // Initialize the Web Audio API
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Tempo: milliseconds per note. 100ms is FAST (150 BPM at 16th notes)
    const tempo = 100; 
    let noteIndex = 0;

    // --- HIGH ENERGY ARPEGGIO ---
    // Frequencies in Hz (A chaotic but harmonic C Minor / Eb Major pentatonic vibe)
    const melodyNotes = [
        523.25, 659.25, 783.99, 1046.50, // Going up
        783.99, 659.25, 523.25, 392.00,  // Coming down
        440.00, 523.25, 698.46, 880.00,  // Shifting chord
        698.46, 523.25, 440.00, 349.23
    ];

    // --- DRIVING BASSLINE ---
    const bassNotes = [
        130.81, 130.81, 130.81, 130.81, // C
        174.61, 174.61, 174.61, 174.61, // F
        155.56, 155.56, 155.56, 155.56, // Eb
        196.00, 196.00, 196.00, 196.00  // G
    ];

    function playSynthLoop() {
        const time = audioCtx.currentTime;

        // 1. LEAD SYNTH (Square wave for that retro Gameboy crunch)
        const leadOsc = audioCtx.createOscillator();
        const leadGain = audioCtx.createGain();
        leadOsc.type = 'square';
        leadOsc.frequency.setValueAtTime(melodyNotes[noteIndex % melodyNotes.length], time);

        // Snappy envelope to make it "bounce"
        leadGain.gain.setValueAtTime(0.08, time); // Volume
        leadGain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);

        leadOsc.connect(leadGain);
        leadGain.connect(audioCtx.destination);
        leadOsc.start(time);
        leadOsc.stop(time + 0.1);

        // 2. BASS SYNTH (Sawtooth wave for a buzzy, thick bottom end)
        const bassOsc = audioCtx.createOscillator();
        const bassGain = audioCtx.createGain();
        bassOsc.type = 'sawtooth';
        bassOsc.frequency.setValueAtTime(bassNotes[noteIndex % bassNotes.length], time);

        // Slightly longer envelope for the bass
        bassGain.gain.setValueAtTime(0.12, time);
        bassGain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);

        bassOsc.connect(bassGain);
        bassGain.connect(audioCtx.destination);
        bassOsc.start(time);
        bassOsc.stop(time + 0.1);

        // Advance the sequence
        noteIndex++;

        // Recursively schedule the next note to keep the loop going infinitely
        setTimeout(playSynthLoop, tempo);
    }

    // Start the madness
    playSynthLoop();
});
