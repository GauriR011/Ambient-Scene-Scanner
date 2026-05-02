import React, { useState, useEffect, useRef, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { Camera, RefreshCw, Download, Copy, X, Share2, Palette, Sparkles } from 'lucide-react';

// --- Configuration & API Logic ---
const apiKey = ""; // Provided by environment

const App = () => {
  // --- Refs ---
  const videoRef = useRef(null);
  const canvasRef = useRef(null); // Real-time processing
  const exportCanvasRef = useRef(null); // High-res Polaroid generation
  const processingInterval = useRef(null);
  const visionInterval = useRef(null);

  // --- State ---
  const [stream, setStream] = useState(null);
  const [colors, setColors] = useState(['#000000', '#333333', '#666666', '#999999', '#CCCCCC']);
  const [visionData, setVisionData] = useState({ caption: "Scanning reality...", paletteName: "Neutral Drift" });
  const [isExporting, setIsExporting] = useState(false);
  const [exportedImageUrl, setExportedImageUrl] = useState(null);
  const [copyStatus, setCopyStatus] = useState("Copy Hex");
  const [error, setError] = useState(null);
  const [isLoadingVision, setIsLoadingVision] = useState(false);

  // --- Camera Initialization ---
  const startCamera = async () => {
    try {
      const constraints = {
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      };
      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(newStream);
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }
    } catch (err) {
      setError("Camera access denied. Please check permissions.");
    }
  };

  useEffect(() => {
    startCamera();
    return () => {
      if (stream) stream.getTracks().forEach(track => track.stop());
    }
  }, []);

  // --- Color Extraction Logic (Throttled ~5fps) ---
  const extractColors = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || videoRef.current.readyState < 2) return;

    const ctx = canvasRef.current.getContext('2d', { willReadFrequently: true });
    const width = 100; // Small resolution for performance
    const height = (videoRef.current.videoHeight / videoRef.current.videoWidth) * width;
    
    canvasRef.current.width = width;
    canvasRef.current.height = height;
    ctx.drawImage(videoRef.current, 0, 0, width, height);

    const imageData = ctx.getImageData(0, 0, width, height).data;
    const pixelCount = imageData.length / 4;
    
    // Simple quantization: Divide image into 5 segments and pick average color
    const segmentSize = Math.floor(pixelCount / 5);
    const newColors = [];

    for (let i = 0; i < 5; i++) {
      let r = 0, g = 0, b = 0;
      const start = i * segmentSize;
      const end = (i + 1) * segmentSize;
      
      for (let j = start; j < end; j++) {
        r += imageData[j * 4];
        g += imageData[j * 4 + 1];
        b += imageData[j * 4 + 2];
      }
      
      const count = end - start;
      const toHex = (c) => Math.round(c / count).toString(16).padStart(2, '0');
      newColors.push(`#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase());
    }
    setColors(newColors);
  }, [stream]);

  // --- Vision LLM Analysis ---
  const performVisionAnalysis = async () => {
    if (!videoRef.current || isLoadingVision) return;

    setIsLoadingVision(true);
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 640;
    tempCanvas.height = 480;
    const tCtx = tempCanvas.getContext('2d');
    tCtx.drawImage(videoRef.current, 0, 0, 640, 480);
    const base64Image = tempCanvas.toDataURL('image/jpeg', 0.6).split(',')[1];

    const systemPrompt = `Analyze the mood, lighting, and colors of this webcam frame. Provide a JSON response with exactly two keys: 'caption' (a sharp, clever, and interesting one-liner capturing the vibe, maximum 7 words. Avoid cliché, cringy, or overly dramatic poetic phrasing. Think witty, insightful observations) and 'paletteName' (a creative, two-word aesthetic name for the colors).`;

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: "Analyze this scene." },
              { inlineData: { mimeType: "image/jpeg", data: base64Image } }
            ]
          }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        setVisionData(JSON.parse(text));
      }
    } catch (err) {
      console.error("Vision failed", err);
    } finally {
      setIsLoadingVision(false);
    }
  };

  // --- Loops ---
  useEffect(() => {
    processingInterval.current = setInterval(extractColors, 200);
    visionInterval.current = setInterval(performVisionAnalysis, 6000);
    return () => {
      clearInterval(processingInterval.current);
      clearInterval(visionInterval.current);
    };
  }, [extractColors]);

  // --- Polaroid Export Generator ---
  const generatePostcard = async () => {
    setIsExporting(true);
    const canvas = exportCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const width = 1080;
    const height = 1720;
    canvas.width = width;
    canvas.height = height;

    // 1. Base Background
    ctx.fillStyle = "#f8f8f8";
    ctx.fillRect(0, 0, width, height);

    // 2. Draw Image (Center Crop 4:5)
    const imgWidth = width * 0.9;
    const imgHeight = imgWidth * 1.25;
    const imgX = (width - imgWidth) / 2;
    const imgY = 80;

    // Source coordinates for center-crop
    const vW = videoRef.current.videoWidth;
    const vH = videoRef.current.videoHeight;
    const targetAspect = 4/5;
    let sW, sH, sX, sY;

    if (vW / vH > targetAspect) {
      sH = vH;
      sW = vH * targetAspect;
      sX = (vW - sW) / 2;
      sY = 0;
    } else {
      sW = vW;
      sH = vW / targetAspect;
      sX = 0;
      sY = (vH - sH) / 2;
    }

    ctx.save();
    // Apply Filters
    ctx.filter = "contrast(1.05) saturate(0.95) brightness(1.05)";
    ctx.drawImage(videoRef.current, sX, sY, sW, sH, imgX, imgY, imgWidth, imgHeight);
    
    // Subtle radial vignette on image
    const grad = ctx.createRadialGradient(
      imgX + imgWidth/2, imgY + imgHeight/2, 0,
      imgX + imgWidth/2, imgY + imgHeight/2, imgHeight/0.8
    );
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.15)');
    ctx.fillStyle = grad;
    ctx.fillRect(imgX, imgY, imgWidth, imgHeight);
    ctx.restore();

    // 3. Text Elements
    ctx.textAlign = "center";
    ctx.fillStyle = "#1a1a1a";

    // Caption
    ctx.font = "italic 48px Georgia, serif";
    ctx.fillText(visionData.caption, width / 2, imgY + imgHeight + 100);

    // Palette Name
    ctx.font = "bold 24px sans-serif";
    ctx.letterSpacing = "4px";
    ctx.fillStyle = "#666";
    ctx.fillText(visionData.paletteName.toUpperCase(), width / 2, imgY + imgHeight + 160);

    // 4. Color Swatches
    const swatchSize = 150;
    const spacing = 30;
    const totalSwatchWidth = (swatchSize * 5) + (spacing * 4);
    let startX = (width - totalSwatchWidth) / 2;
    const swatchY = height - 350;

    colors.forEach((color, i) => {
      const x = startX + i * (swatchSize + spacing);
      // Square
      ctx.fillStyle = color;
      ctx.fillRect(x, swatchY, swatchSize, swatchSize);
      
      // Hex Code
      ctx.fillStyle = "#333";
      ctx.font = "20px monospace";
      ctx.letterSpacing = "0px";
      ctx.fillText(color, x + swatchSize / 2, swatchY + swatchSize + 40);
    });

    setExportedImageUrl(canvas.toDataURL('image/jpeg', 0.9));
    setIsExporting(false);
  };

  const copyHexToClipboard = () => {
    const hexString = colors.join(', ');
    const textArea = document.createElement("textarea");
    textArea.value = hexString;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      setCopyStatus("Copied!");
      setTimeout(() => setCopyStatus("Copy Hex"), 2000);
    } catch (err) {
      console.error('Fallback: Oops, unable to copy', err);
    }
    document.body.removeChild(textArea);
  };

  const shareOrDownload = async () => {
    const filename = `scene-soul-${Date.now()}.jpg`;
    
    // Check for native share (mobile focus)
    if (navigator.canShare && navigator.share) {
      try {
        const response = await fetch(exportedImageUrl);
        const blob = await response.blob();
        const file = new File([blob], filename, { type: 'image/jpeg' });
        await navigator.share({
          files: [file],
          title: 'Ambient Scene Scanner',
          text: `Current vibe: ${visionData.caption}`
        });
        return;
      } catch (err) {
        console.error("Sharing failed", err);
      }
    }

    // Fallback to Download
    const link = document.createElement('a');
    link.download = filename;
    link.href = exportedImageUrl;
    link.click();
  };

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden font-sans text-white select-none">
      {/* 1. Camera Background */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover grayscale-[0.2]"
      />
      
      {/* 2. Visual Overlays */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle,transparent_40%,rgba(0,0,0,0.7)_100%)]" />
      
      {/* Poetic Caption Overlay */}
      <div className="absolute inset-0 flex items-center justify-center p-12 pointer-events-none">
        <h1 
          className="text-3xl md:text-5xl text-center font-serif italic text-white drop-shadow-[0_4px_12px_rgba(0,0,0,0.9)] animate-in fade-in zoom-in duration-1000"
          style={{ textShadow: '2px 2px 20px rgba(0,0,0,0.8)' }}
          key={visionData.caption} // Trigger animation on change
        >
          {visionData.caption}
        </h1>
      </div>

      {/* 3. Control Panel (Bottom) */}
      <div className="absolute bottom-0 left-0 w-full p-6 md:p-8 flex flex-col items-center gap-6">
        
        {/* Token Strip */}
        <div className="w-full max-w-xl backdrop-blur-xl bg-white/10 rounded-2xl p-1 border border-white/20 shadow-2xl overflow-hidden flex items-stretch h-14 md:h-20">
          {colors.map((color, idx) => (
            <div 
              key={idx} 
              className="flex-1 transition-all duration-500 hover:flex-[1.5] group relative flex items-center justify-center"
              style={{ backgroundColor: color }}
            >
              <span className="opacity-0 group-hover:opacity-100 text-[10px] md:text-xs font-mono font-bold mix-blend-difference transition-opacity">
                {color}
              </span>
            </div>
          ))}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-4 w-full max-w-xl">
          <div className="flex-1 backdrop-blur-md bg-black/40 border border-white/10 rounded-xl px-4 h-14 flex items-center gap-3">
             <Palette className="w-5 h-5 text-zinc-400 shrink-0" />
             <div className="overflow-hidden">
               <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Palette</p>
               <p className="text-sm font-semibold truncate uppercase">{visionData.paletteName}</p>
             </div>
          </div>

          <button 
            onClick={generatePostcard}
            disabled={isExporting}
            className="h-14 aspect-square flex items-center justify-center bg-white text-black rounded-xl hover:scale-105 active:scale-95 transition-all shadow-lg disabled:opacity-50"
          >
            {isExporting ? <RefreshCw className="animate-spin" /> : <Camera />}
          </button>

          <div className="flex-1 backdrop-blur-md bg-black/40 border border-white/10 rounded-xl px-4 h-14 flex items-center gap-3">
             {isLoadingVision ? (
               <RefreshCw className="w-5 h-5 text-blue-400 animate-spin shrink-0" />
             ) : (
               <Sparkles className="w-5 h-5 text-blue-400 shrink-0" />
             )}
             <div>
               <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Sense</p>
               <p className="text-sm font-semibold">{isLoadingVision ? "Thinking..." : "Active"}</p>
             </div>
          </div>
        </div>
      </div>

      {/* Hidden Processing Elements */}
      <canvas ref={canvasRef} className="hidden" />
      <canvas ref={exportCanvasRef} className="hidden" />

      {/* 4. Export Modal */}
      {exportedImageUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="relative max-w-lg w-full flex flex-col items-center gap-6">
            
            {/* Postcard Preview */}
            <div className="relative shadow-[0_20px_50px_rgba(0,0,0,0.5)] transform -rotate-1">
              <img 
                src={exportedImageUrl} 
                alt="Exported Postcard" 
                className="max-h-[70vh] rounded-sm object-contain"
              />
            </div>

            {/* Modal Actions */}
            <div className="flex flex-wrap justify-center gap-3 w-full">
              <button 
                onClick={() => setExportedImageUrl(null)}
                className="px-6 h-12 rounded-full bg-zinc-800 text-zinc-300 flex items-center gap-2 hover:bg-zinc-700 transition-colors"
              >
                <X className="w-4 h-4" /> Back
              </button>
              
              <button 
                onClick={copyHexToClipboard}
                className="px-6 h-12 rounded-full bg-zinc-800 text-zinc-300 flex items-center gap-2 hover:bg-zinc-700 transition-colors"
              >
                {copyStatus === "Copied!" ? <Sparkles className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copyStatus}
              </button>

              <button 
                onClick={shareOrDownload}
                className="px-6 h-12 rounded-full bg-blue-600 text-white flex items-center gap-2 hover:bg-blue-500 transition-colors"
              >
                <Share2 className="w-4 h-4" /> Save & Share
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fallback/Error UI */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-zinc-900 text-center">
          <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-6">
            <Camera className="w-10 h-10 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Camera Unavailable</h2>
          <p className="text-zinc-400 max-w-xs">{error}</p>
        </div>
      )}
    </div>
  );
};

export default App;