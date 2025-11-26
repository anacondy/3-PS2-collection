import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Disc, Gamepad2, Activity, Terminal, Database, Cpu, Lock, User, Calendar, List } from 'lucide-react';

/* -------------------------------------------------------------------------- */
/* HOOK: SECRET KEY COMBO (C + O + 2)          */
/* -------------------------------------------------------------------------- */
const useSecretCode = (onUnlock) => {
  const [pressed, setPressed] = useState(new Set());
  const [progress, setProgress] = useState(0);
  const timerRef = useRef(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      setPressed(prev => new Set(prev).add(e.key.toLowerCase()));
    };

    const handleKeyUp = (e) => {
      setPressed(prev => {
        const next = new Set(prev);
        next.delete(e.key.toLowerCase());
        return next;
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Check combo state
  useEffect(() => {
    const hasC = pressed.has('c');
    const hasO = pressed.has('o');
    const has2 = pressed.has('2');
    const isCombo = hasC && hasO && has2;

    if (isCombo) {
      if (!timerRef.current) {
        // Start holding
        let p = 0;
        intervalRef.current = setInterval(() => {
          p += 5; // Fill up over 2 seconds (roughly)
          setProgress(p);
        }, 100);

        timerRef.current = setTimeout(() => {
          onUnlock();
          setProgress(0);
          clearInterval(intervalRef.current);
          timerRef.current = null;
          intervalRef.current = null;
        }, 2000);
      }
    } else {
      // Reset if keys released
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        clearInterval(intervalRef.current);
        timerRef.current = null;
        intervalRef.current = null;
        setProgress(0);
      }
    }
  }, [pressed, onUnlock]);

  return progress;
};

/* -------------------------------------------------------------------------- */
/* AUDIO ENGINE V3 (Red Visuals)               */
/* -------------------------------------------------------------------------- */

const useAudioEngine = () => {
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const activeNodesRef = useRef([]);
  const [isSpinning, setIsSpinning] = useState(false);
  const [audioData, setAudioData] = useState(new Uint8Array(0));
  const rafRef = useRef();

  const initAudio = useCallback(() => {
    if (!audioCtxRef.current) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioCtxRef.current = new AudioContext();
      const analyser = audioCtxRef.current.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  }, []);

  const playDiscSound = useCallback((gameId) => {
    initAudio();
    const ctx = audioCtxRef.current;
    const analyser = analyserRef.current;

    // Reset
    activeNodesRef.current.forEach(n => { try { n.stop(); } catch(e){} });
    activeNodesRef.current = [];

    const t = ctx.currentTime;
    
    // Motor Hum
    const motorOsc = ctx.createOscillator();
    const motorGain = ctx.createGain();
    const basePitch = 40 + (gameId * 8); 
    
    motorOsc.type = (gameId % 2 === 0) ? 'sawtooth' : 'square';
    motorOsc.frequency.setValueAtTime(0, t);
    motorOsc.frequency.linearRampToValueAtTime(basePitch, t + 2);

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.5 + ((gameId % 4) * 0.5);
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 5;
    lfo.connect(lfoGain);
    lfoGain.connect(motorOsc.frequency);

    motorGain.gain.setValueAtTime(0, t);
    motorGain.gain.linearRampToValueAtTime(0.15, t + 1);

    motorOsc.connect(motorGain);
    motorGain.connect(analyser); // To visualizer
    analyser.connect(ctx.destination); // To speakers

    motorOsc.start();
    lfo.start();

    // Noise/Texture
    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * (Math.sin(i / (100 + gameId)) > 0.9 ? 3 : 0.5);
    }
    const noiseNode = ctx.createBufferSource();
    noiseNode.buffer = buffer;
    noiseNode.loop = true;
    const noiseGain = ctx.createGain();
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 1000 + (gameId * 100);
    
    noiseGain.gain.setValueAtTime(0, t);
    noiseGain.gain.linearRampToValueAtTime(0.05, t + 2);

    noiseNode.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(analyser);
    
    noiseNode.start();

    activeNodesRef.current = [motorOsc, lfo, noiseNode];
    setIsSpinning(true);

    const updateAnalysis = () => {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteTimeDomainData(dataArray);
        setAudioData(dataArray);
        rafRef.current = requestAnimationFrame(updateAnalysis);
    };
    updateAnalysis();

  }, [initAudio]);

  const stopDiscSound = useCallback(() => {
    if(rafRef.current) cancelAnimationFrame(rafRef.current);
    activeNodesRef.current.forEach(node => {
        try { node.stop(audioCtxRef.current.currentTime + 0.5); } catch(e){}
    });
    activeNodesRef.current = [];
    setIsSpinning(false);
    setAudioData(new Uint8Array(0));
  }, []);

  const playUiSound = useCallback((type) => {
    initAudio();
    const ctx = audioCtxRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    if (type === 'hover') {
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.05);
        gain.gain.value = 0.02;
    } else if (type === 'open') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(100, ctx.currentTime);
        gain.gain.value = 0.2;
    }

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  }, [initAudio]);

  return { playDiscSound, stopDiscSound, playUiSound, isSpinning, audioData };
};

/* -------------------------------------------------------------------------- */
/* DATA                                    */
/* -------------------------------------------------------------------------- */

const gamesData = [
  { id: 1, title: "Haunting Ground", publisher: "CAPCOM", color: "from-stone-300 via-stone-200 to-stone-400", textColor: "text-stone-900", rating: "16+", description: "A survival horror game where Fiona Belli must escape a castle with her dog, Hewie. Panic mechanics induce blurred vision.", serial: "SLES-53133" },
  { id: 2, title: "Manhunt", publisher: "Rockstar", color: "from-green-900 via-black to-green-950", textColor: "text-green-500", rating: "18", description: "Psychological horror stealth. The sound of this disc is gritty and distorted like a VHS tape.", serial: "SLES-52055" },
  { id: 3, title: "Silent Hill 2", publisher: "KONAMI", color: "from-black via-stone-900 to-black", textColor: "text-white", rating: "18", description: "The definitive psychological horror. Audio profile features low, depressing drone frequencies.", serial: "SLES-50382" },
  { id: 4, title: "Silent Hill 3", publisher: "KONAMI", color: "from-orange-900 via-red-900 to-black", textColor: "text-orange-200", rating: "15", description: "Direct sequel. Known for rusty, bloody textures. Disc spins with an aggressive, metallic whine.", serial: "SLES-51434" },
  { id: 5, title: "Project Zero", publisher: "TECMO", color: "from-indigo-950 via-black to-black", textColor: "text-indigo-200", rating: "15", description: "Capture spirits with a camera. High-pitched spectral frequencies in the spin audio.", serial: "SLES-50821" },
  { id: 6, title: "Rule of Rose", publisher: "505 GAMES", color: "from-rose-900 via-black to-stone-900", textColor: "text-rose-200", rating: "16", description: "Psychological horror involving children and hierarchy. Unsettling, uneven spin rhythm.", serial: "SLES-54218" },
  { id: 7, title: "Kuon", publisher: "FromSoftware", color: "from-red-950 via-yellow-900 to-black", textColor: "text-yellow-100", rating: "18", description: "Heian-period horror. Traditional instrument harmonics hidden in the noise floor.", serial: "SLES-53026" },
  { id: 8, title: "Forbidden Siren", publisher: "Sony", color: "from-red-800 via-black to-red-950", textColor: "text-red-500", rating: "18", description: "Sight-jacking mechanic. Disc audio includes static bursts simulating signal interference.", serial: "SCES-52328" },
  { id: 9, title: "Clock Tower 3", publisher: "CAPCOM", color: "from-purple-900 via-black to-purple-950", textColor: "text-purple-200", rating: "15", description: "Escape the stalkers. A rhythmic, pounding sound profile.", serial: "SLES-51619" },
  { id: 10, title: "Obscure", publisher: "Microids", color: "from-blue-900 via-stone-800 to-black", textColor: "text-blue-100", rating: "16", description: "High school survival horror. Standard reliable motor hum.", serial: "SLES-52735" },
];

/* -------------------------------------------------------------------------- */
/* SYSTEM REGISTRY PANEL (SECRET)              */
/* -------------------------------------------------------------------------- */
const SystemRegistry = ({ onClose }) => {
  // Close on ESC
  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-neutral-900 border border-red-900/50 shadow-[0_0_50px_rgba(153,27,27,0.2)] rounded-sm overflow-hidden relative font-mono">
        
        {/* Header */}
        <div className="bg-red-950/20 border-b border-red-900/30 p-4 flex justify-between items-center">
            <div className="flex items-center gap-3">
                <Terminal className="text-red-500" size={18} />
                <h2 className="text-red-500 font-bold tracking-widest text-lg">SYSTEM_REGISTRY.SYS</h2>
            </div>
            <button onClick={onClose} className="text-red-500 hover:text-white transition-colors">
                <X size={20} />
            </button>
        </div>

        {/* Content */}
        <div className="p-8 text-neutral-300 space-y-8">
            
            {/* Metadata Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                    <div className="flex items-start gap-3">
                        <User className="text-red-600 mt-1" size={16} />
                        <div>
                            <span className="block text-xs text-neutral-500 uppercase">Author</span>
                            <span className="text-lg font-bold text-white">Anacondy</span>
                        </div>
                    </div>
                    <div className="flex items-start gap-3">
                        <Calendar className="text-red-600 mt-1" size={16} />
                        <div>
                            <span className="block text-xs text-neutral-500 uppercase">Origin Date</span>
                            <span className="text-lg font-bold text-white">May 21, 2024</span>
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="flex items-start gap-3">
                        <Cpu className="text-red-600 mt-1" size={16} />
                        <div>
                            <span className="block text-xs text-neutral-500 uppercase">Version</span>
                            <span className="text-lg font-bold text-white">v3.1.4 (BETA)</span>
                        </div>
                    </div>
                    <div className="flex items-start gap-3">
                        <Lock className="text-red-600 mt-1" size={16} />
                        <div>
                            <span className="block text-xs text-neutral-500 uppercase">Security Level</span>
                            <span className="text-lg font-bold text-white text-green-500">ROOT ACCESS</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Features List */}
            <div className="border-t border-red-900/30 pt-6">
                <div className="flex items-center gap-2 mb-4">
                    <List className="text-red-500" size={16} />
                    <h3 className="uppercase tracking-widest text-sm font-bold text-red-500">Feature Log</h3>
                </div>
                <ul className="space-y-2 text-xs md:text-sm font-light text-neutral-400 h-48 overflow-y-auto custom-scrollbar">
                    <li className="flex gap-2"><span className="text-red-500">[+]</span> Immersive Wall Grid Layout (Gapless)</li>
                    <li className="flex gap-2"><span className="text-red-500">[+]</span> Generative Audio Engine (Mathematical Synthesis)</li>
                    <li className="flex gap-2"><span className="text-red-500">[+]</span> Visualizer V2: Red Scratch Overlay</li>
                    <li className="flex gap-2"><span className="text-red-500">[+]</span> Dynamic Cover Art Generation</li>
                    <li className="flex gap-2"><span className="text-red-500">[+]</span> Audio-Reactive Jitter Effects</li>
                    <li className="flex gap-2"><span className="text-red-500">[+]</span> Secret Key Combo Unlock Logic</li>
                    <li className="flex gap-2"><span className="text-red-500">[+]</span> 3D CSS Perspectives on Zoom</li>
                    <li className="flex gap-2"><span className="text-red-500">[+]</span> Mobile Responsive Touch Events</li>
                </ul>
            </div>
        </div>

        {/* Footer */}
        <div className="bg-black p-2 border-t border-red-900/30 flex justify-between px-4 text-[10px] text-red-900 font-bold uppercase tracking-widest">
            <span>CONFIDENTIAL</span>
            <span>INTERNAL USE ONLY</span>
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* MAIN APP COMPONENT                          */
/* -------------------------------------------------------------------------- */

export default function App() {
  const [selectedGame, setSelectedGame] = useState(null);
  const [isClosing, setIsClosing] = useState(false);
  const [showRegistry, setShowRegistry] = useState(false);
  
  const { playDiscSound, stopDiscSound, playUiSound, isSpinning, audioData } = useAudioEngine();
  
  const unlockProgress = useSecretCode(() => {
    setShowRegistry(true);
    playUiSound('open');
  });

  const handleGameSelect = (game) => {
    playUiSound('open');
    setSelectedGame(game);
  };

  const handleClose = () => {
    if(isSpinning) stopDiscSound();
    setIsClosing(true);
    setTimeout(() => {
      setSelectedGame(null);
      setIsClosing(false);
    }, 300);
  };

  const togglePlayback = (e) => {
    e.stopPropagation();
    if (isSpinning) {
        stopDiscSound();
    } else {
        playDiscSound(selectedGame.id);
    }
  };

  const getVisuals = () => {
    if (!audioData || audioData.length === 0) return { x: 0, y: 0, scratch: 0 };
    let sum = 0;
    for(let i=0; i<audioData.length; i++) sum += Math.abs(audioData[i] - 128);
    const avg = sum / audioData.length;
    const highFreq = audioData[10] || 128; 

    return {
        x: (Math.random() - 0.5) * (avg * 0.1),
        y: (Math.random() - 0.5) * (avg * 0.1),
        scratchOp: (highFreq > 140 && Math.random() > 0.7) ? 0.6 : 0 // Slightly higher opacity
    };
  };

  const visuals = getVisuals();

  return (
    <div className="min-h-screen bg-black text-gray-200 font-sans overflow-x-hidden selection:bg-red-900 selection:text-white">
      
      {/* Dynamic Background Noise */}
      <div className="fixed inset-0 opacity-10 pointer-events-none z-0 mix-blend-overlay" 
           style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")` }}>
      </div>

      {/* Secret Registry Modal */}
      {showRegistry && <SystemRegistry onClose={() => setShowRegistry(false)} />}

      {/* Unlock Progress Indicator (Bottom Right) */}
      {unlockProgress > 0 && !showRegistry && (
          <div className="fixed bottom-4 right-4 z-[100] flex flex-col items-end gap-1">
              <span className="text-[10px] text-red-500 font-mono animate-pulse">DECRYPTING...</span>
              <div className="w-32 h-1 bg-red-900/30">
                  <div className="h-full bg-red-600 transition-all duration-100 ease-linear" style={{ width: `${unlockProgress}%` }}></div>
              </div>
          </div>
      )}

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-black/90 backdrop-blur-sm border-b border-neutral-800">
        <div className="w-full px-4 h-12 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className={`w-4 h-4 ${isSpinning ? 'text-red-500 animate-pulse' : 'text-neutral-600'}`} />
            <h1 className="text-sm font-bold tracking-widest text-neutral-400">
              ARCHIVE<span className="text-red-800">.SYS</span>
            </h1>
          </div>
          <div className="hidden sm:flex gap-4 text-[10px] font-mono text-neutral-600 uppercase">
             <span>MEM: 64MB</span>
             <span>CPU: EE_CORE</span>
          </div>
        </div>
      </header>

      {/* WALL OF GAMES */}
      <main className="pt-12 relative z-10 w-full">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 bg-black">
          {gamesData.map((game) => (
            <div
              key={game.id}
              onClick={() => handleGameSelect(game)}
              onMouseEnter={() => playUiSound('hover')}
              className="group relative cursor-pointer aspect-[2/3] overflow-hidden border-r border-b border-white/5"
            >
              <div className={`w-full h-full bg-gradient-to-br ${game.color} relative transition-all duration-300 group-hover:brightness-110`}>
                <div className="absolute top-0 left-0 right-0 h-6 bg-black flex items-center px-2 justify-between z-20">
                  <div className="w-full h-[2px] bg-gradient-to-r from-blue-600 to-black mb-[-2px]"></div>
                  <span className="font-sans text-[9px] tracking-[0.1em] font-bold text-white italic">PlayStation.2</span>
                  <span className="text-[8px] text-neutral-500 font-mono">PAL</span>
                </div>

                <div className="absolute inset-0 p-4 pt-10 flex flex-col justify-between">
                   <div className="transform transition-transform duration-500 group-hover:translate-x-1">
                      <h2 className={`text-xl sm:text-2xl font-serif font-bold leading-none ${game.textColor} drop-shadow-lg`}>
                        {game.title}
                      </h2>
                   </div>
                   
                   <div className="flex justify-between items-end opacity-70">
                      <div className="bg-white text-black w-6 h-8 flex items-center justify-center font-bold text-[10px] border border-black">
                        {game.rating}
                      </div>
                      <span className="text-[9px] font-mono text-white/50">{game.serial}</span>
                   </div>
                </div>
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent pointer-events-none"></div>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* ZOOM MODAL */}
      {(selectedGame || isClosing) && (
        <div 
          className={`fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-xl transition-opacity duration-300 ${isClosing ? 'opacity-0' : 'opacity-100'}`}
          onClick={handleClose}
        >
          {/* SCRATCH VISUALIZER (RED NOW) */}
          {isSpinning && (
             <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden opacity-50 mix-blend-screen">
                <div 
                  className="absolute h-[1px] bg-red-600 w-full top-1/4 shadow-[0_0_10px_red]" 
                  style={{ opacity: visuals.scratchOp, transform: `translateY(${visuals.y * 10}px)` }} 
                />
                <div 
                  className="absolute h-[2px] bg-red-500 w-full top-2/3 shadow-[0_0_10px_red]" 
                  style={{ opacity: visuals.scratchOp, transform: `translateY(${visuals.x * -20}px) rotate(1deg)` }} 
                />
                <div 
                  className="absolute w-[1px] bg-red-600 h-full left-1/3 shadow-[0_0_10px_red]" 
                  style={{ opacity: visuals.scratchOp, transform: `translateX(${visuals.x * 50}px)` }} 
                />
             </div>
          )}

          <div 
            className={`
              relative w-full max-w-4xl h-[600px] flex flex-col md:flex-row bg-neutral-900 border border-neutral-800 shadow-2xl
              transition-transform duration-300 ${isClosing ? 'scale-90' : 'scale-100'}
            `}
            onClick={(e) => e.stopPropagation()}
            style={{
                transform: `translate(${visuals.x}px, ${visuals.y}px) ${isClosing ? 'scale(0.9)' : 'scale(1)'}`
            }}
          >
            {/* Left: Case Art */}
            <div className={`md:w-5/12 relative bg-gradient-to-br ${selectedGame?.color} p-8 flex flex-col justify-between overflow-hidden`}>
                <div className="absolute top-0 left-0 right-0 h-10 bg-black flex items-center px-4 justify-between z-10">
                   <span className="font-sans text-xs tracking-widest font-bold text-white italic">PlayStation.2</span>
                </div>
                <div className="mt-12 relative z-10">
                   <h2 className={`text-5xl font-serif font-bold leading-none ${selectedGame?.textColor} drop-shadow-2xl`}>
                      {selectedGame?.title}
                   </h2>
                </div>
                <div className={`absolute -right-20 -bottom-20 opacity-30 transition-all duration-[2000ms] ${isSpinning ? 'rotate-[3600deg]' : 'rotate-0'}`}>
                    <Disc size={300} className="text-white" />
                </div>
            </div>

            {/* Right: Controls */}
            <div className="md:w-7/12 p-8 bg-neutral-900 flex flex-col relative text-neutral-300">
                <button onClick={handleClose} className="absolute top-4 right-4 text-neutral-500 hover:text-white">
                    <X />
                </button>

                <div className="mb-6 flex items-center gap-2 text-xs font-mono text-neutral-500">
                    <Database size={12} />
                    <span>ID: {selectedGame?.id.toString().padStart(4, '0')}</span>
                    {isSpinning && <span className="text-red-500 animate-pulse ml-2 font-bold">READING SECTOR...</span>}
                </div>

                <h3 className="text-xl text-white font-bold mb-4">Description</h3>
                <p className="text-neutral-400 leading-relaxed mb-8">
                    {selectedGame?.description}
                </p>

                <div className="mt-auto">
                    <button 
                        onClick={togglePlayback}
                        className={`
                            w-full h-16 rounded-sm border flex items-center justify-center gap-3 font-mono text-sm tracking-widest transition-all
                            ${isSpinning 
                                ? 'bg-red-950/20 border-red-900 text-red-500 shadow-[0_0_15px_rgba(220,38,38,0.2)]' 
                                : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:bg-neutral-700 hover:text-white'}
                        `}
                    >
                        {isSpinning ? (
                            <>
                                <Activity className="animate-bounce" size={16} /> 
                                EJECT DISC (READING...)
                            </>
                        ) : (
                            <>
                                <Disc size={16} /> 
                                INSERT DISC
                            </>
                        )}
                    </button>
                    
                    {/* Audio Waveform (RED BARS) */}
                    <div className="flex items-end justify-between h-8 mt-4 px-1 gap-1 opacity-60">
                        {[...Array(30)].map((_, i) => (
                            <div 
                                key={i}
                                className={`w-full bg-red-600 transition-all duration-75 shadow-[0_0_5px_red]`}
                                style={{ 
                                    height: isSpinning ? `${Math.random() * 100}%` : '2px',
                                    opacity: isSpinning ? Math.random() : 0.2
                                }}
                            ></div>
                        ))}
                    </div>
                </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
