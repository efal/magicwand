import React, { useState, useRef, useEffect, useCallback } from 'react';
import { CutIcon, DownloadIcon, ResetIcon, ScaleIcon, WandIcon, DownloadSVGIcon, InvertIcon, BrushIcon, OpacityIcon, FeatherIcon, TextIcon, FontSizeIcon, AddIcon, SubtractIcon, NewSelectionIcon } from './Icons';

interface ImageEditorProps {
  imageSrc: string;
  onReset: () => void;
}

type Point = { x: number; y: number };
type Bounds = { minX: number; minY: number; width: number; height: number; };
type AppliedText = { text: string; color: string; size: number; pos: Point };
type SelectionMode = 'new' | 'add' | 'subtract';

const ControlSlider: React.FC<{
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  icon: React.ReactNode;
  unit?: string;
}> = ({ id, label, value, min, max, step, onChange, icon, unit }) => (
  <div className="flex flex-col space-y-2">
    <label htmlFor={id} className="flex items-center space-x-2 text-sm font-medium text-slate-300">
      {icon}
      <span>{label}</span>
      <span className="font-mono text-cyan-400">{value}{unit}</span>
    </label>
    <input
      id={id}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={onChange}
      className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer range-lg accent-cyan-500"
    />
  </div>
);

// Hilfsfunktion für den Gaußschen Weichzeichner
const applyGaussianBlur = (mask: Uint8ClampedArray, width: number, height: number, radius: number): Uint8ClampedArray => {
  if (radius === 0) return new Uint8ClampedArray(mask.map(v => v * 255));
  
  const kernelSize = radius * 2 + 1;
  const kernel: number[] = [];
  const sigma = radius / 2; // Erhöht für einen stärkeren Effekt
  const sigmaSq = sigma * sigma;
  let kernelSum = 0;
  for (let i = 0; i < kernelSize; i++) {
    const distance = i - radius;
    const value = Math.exp(-0.5 * (distance * distance) / sigmaSq);
    kernel.push(value);
    kernelSum += value;
  }
  for (let i = 0; i < kernelSize; i++) {
    kernel[i] /= kernelSum;
  }

  const temp = new Float32Array(width * height);
  const result = new Uint8ClampedArray(width * height);

  // Horizontaler Durchgang
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let i = 0; i < kernelSize; i++) {
        const px = x + i - radius;
        if (px >= 0 && px < width) {
          sum += (mask[y * width + px] * 255) * kernel[i];
        }
      }
      temp[y * width + x] = sum;
    }
  }

  // Vertikaler Durchgang
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let i = 0; i < kernelSize; i++) {
        const py = y + i - radius;
        if (py >= 0 && py < height) {
          sum += temp[py * width + x] * kernel[i];
        }
      }
      result[y * width + x] = sum;
    }
  }

  return result;
};


export const ImageEditor: React.FC<ImageEditorProps> = ({ imageSrc, onReset }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const lastPointRef = useRef<Point | null>(null);
  
  const [tolerance, setTolerance] = useState(20);
  const [scale, setScale] = useState(1);
  const [selectionMask, setSelectionMask] = useState<Uint8ClampedArray | null>(null);
  const [selectionBounds, setSelectionBounds] = useState<Bounds | null>(null);
  const [croppedImageData, setCroppedImageData] = useState<ImageData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [tool, setTool] = useState<'wand' | 'brush' | 'text'>('wand');
  const [brushSize, setBrushSize] = useState(30);
  const [selectionOpacity, setSelectionOpacity] = useState(40);
  const [edgeSmoothing, setEdgeSmoothing] = useState(2);
  const [isPainting, setIsPainting] = useState(false);
  const [mousePos, setMousePos] = useState({ x: -100, y: -100 });
  const [isMouseInCanvas, setIsMouseInCanvas] = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('new');

  // Text tool state
  const [text, setText] = useState('Hallo Welt');
  const [textColor, setTextColor] = useState('#FFFFFF');
  const [fontSize, setFontSize] = useState(48);
  const [textPosition, setTextPosition] = useState<Point | null>(null);
  const [appliedTexts, setAppliedTexts] = useState<AppliedText[]>([]);

  // Effect to load the image and set canvas size
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    setIsLoading(true);
    setCanvasReady(false);
    
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = imageSrc;
    img.onload = () => {
        const parentWidth = canvas.parentElement?.clientWidth || 800;
        const scale = Math.min(1, parentWidth / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        imageRef.current = img;
        setCanvasReady(true);
        setIsLoading(false);
    };
    img.onerror = () => {
      console.error("Bild konnte nicht geladen werden.");
      setIsLoading(false);
    }
    
    return () => {
        setCanvasReady(false);
        imageRef.current = null;
    }
  }, [imageSrc]);

  const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement>): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.floor(e.clientX - rect.left),
      y: Math.floor(e.clientY - rect.top),
    };
  };

  const handleMagicWandSelect = (x: number, y: number) => {
    if (isLoading || croppedImageData) return;
    setIsLoading(true);

    setTimeout(() => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d', { willReadFrequently: true });
      if (!ctx || !canvas) {
        setIsLoading(false);
        return;
      }

      const { width, height } = canvas;
      const imageData = ctx.getImageData(0, 0, width, height);
      const { data } = imageData;
      const startPos = (y * width + x) * 4;
      const startR = data[startPos];
      const startG = data[startPos + 1];
      const startB = data[startPos + 2];
      
      const newMask = new Uint8ClampedArray(width * height);
      const queue: Point[] = [{ x, y }];
      const visited = new Set<number>([y * width + x]);

      while (queue.length > 0) {
        const { x: curX, y: curY } = queue.shift()!;
        if (curX < 0 || curX >= width || curY < 0 || curY >= height) continue;

        const pos = (curY * width + curX) * 4;
        const r = data[pos];
        const g = data[pos + 1];
        const b = data[pos + 2];

        const diff = Math.sqrt(Math.pow(r - startR, 2) + Math.pow(g - startG, 2) + Math.pow(b - startB, 2));

        if (diff <= tolerance) {
          newMask[curY * width + curX] = 1;
          const neighbors: Point[] = [
            { x: curX + 1, y: curY }, { x: curX - 1, y: curY },
            { x: curX, y: curY + 1 }, { x: curX, y: curY - 1 },
          ];

          for (const neighbor of neighbors) {
              const neighborIndex = neighbor.y * width + neighbor.x;
              if (neighbor.x >= 0 && neighbor.x < width && neighbor.y >= 0 && neighbor.y < height && !visited.has(neighborIndex)) {
                queue.push(neighbor);
                visited.add(neighborIndex);
              }
          }
        }
      }
      
      setSelectionMask(currentMask => {
          if (selectionMode === 'add' && currentMask) {
              const combinedMask = new Uint8ClampedArray(currentMask);
              for (let i = 0; i < newMask.length; i++) {
                  if (newMask[i] === 1) combinedMask[i] = 1;
              }
              return combinedMask;
          }
          if (selectionMode === 'subtract' && currentMask) {
              const subtractedMask = new Uint8ClampedArray(currentMask);
              for (let i = 0; i < newMask.length; i++) {
                  if (newMask[i] === 1) subtractedMask[i] = 0;
              }
              return subtractedMask;
          }
          return newMask;
      });
      setIsLoading(false);
    }, 50);
  };
    
  useEffect(() => {
    if (selectionMask && canvasRef.current) {
        const { width, height } = canvasRef.current;
        let minX = width, minY = height, maxX = 0, maxY = 0;
        let hasSelection = false;
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (selectionMask[y * width + x] === 1) {
                    hasSelection = true;
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }

        if (hasSelection) {
            setSelectionBounds({ minX, minY, width: maxX - minX + 1, height: maxY - minY + 1 });
        } else {
            setSelectionBounds(null);
        }
    } else {
        setSelectionBounds(null);
    }
  }, [selectionMask]);

  // Main drawing effect
  useEffect(() => {
    if (!canvasReady) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas || !imageRef.current) return;

    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    // 1. Draw base image
    ctx.drawImage(imageRef.current, 0, 0, width, height);

    // 2. Draw applied texts
    appliedTexts.forEach(t => {
        ctx.font = `bold ${t.size}px sans-serif`;
        ctx.fillStyle = t.color;
        ctx.textBaseline = 'top';
        ctx.fillText(t.text, t.pos.x, t.pos.y);
    });

    // 3. Draw selection mask overlay
    if (selectionMask) {
        const overlayCanvas = document.createElement('canvas');
        overlayCanvas.width = width;
        overlayCanvas.height = height;
        const overlayCtx = overlayCanvas.getContext('2d');
        if (overlayCtx) {
            const selectionImageData = overlayCtx.createImageData(width, height);
            const alpha = Math.round(selectionOpacity * 2.55);
            for (let i = 0; i < selectionMask.length; i++) {
                if (selectionMask[i] === 1) {
                    const index = i * 4;
                    selectionImageData.data[index] = 0;
                    selectionImageData.data[index + 1] = 255;
                    selectionImageData.data[index + 2] = 255;
                    selectionImageData.data[index + 3] = alpha;
                }
            }
            overlayCtx.putImageData(selectionImageData, 0, 0);
            ctx.drawImage(overlayCanvas, 0, 0);
        }
    }
    
    // 4. Draw selection bounds
    if (selectionBounds) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(
            selectionBounds.minX - 0.5, 
            selectionBounds.minY - 0.5, 
            selectionBounds.width + 1, 
            selectionBounds.height + 1
        );
        ctx.setLineDash([]);
    }

    // 5. Draw text preview
    if (tool === 'text' && text) {
        const pos = textPosition || mousePos;
        if (isMouseInCanvas || textPosition) {
            ctx.font = `bold ${fontSize}px sans-serif`;
            ctx.fillStyle = textColor;
            ctx.globalAlpha = textPosition ? 1.0 : 0.6;
            ctx.textBaseline = 'top';
            ctx.fillText(text, pos.x, pos.y);
            ctx.globalAlpha = 1.0;
        }
    }
}, [canvasReady, selectionMask, selectionOpacity, selectionBounds, appliedTexts, tool, text, textColor, fontSize, textPosition, mousePos, isMouseInCanvas]);


  const modifyMask = useCallback((p: Point, currentMask: Uint8ClampedArray, add: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { width } = canvas;
    const radius = Math.floor(brushSize / 2);
    
    for (let i = -radius; i <= radius; i++) {
        for (let j = -radius; j <= radius; j++) {
            if (i * i + j * j <= radius * radius) {
                const px = p.x + j;
                const py = p.y + i;
                if (px >= 0 && px < canvas.width && py >= 0 && py < canvas.height) {
                    currentMask[py * width + px] = add ? 1 : 0;
                }
            }
        }
    }
  }, [brushSize]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (croppedImageData) return;
    const point = getCanvasCoordinates(e);
    if (!point) return;

    if (tool === 'wand') {
      handleMagicWandSelect(point.x, point.y);
    } else if (tool === 'brush') {
      setIsPainting(true);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const { width, height } = canvas;
      const baseMask = (selectionMode === 'new' || !selectionMask) ? new Uint8ClampedArray(width * height) : new Uint8ClampedArray(selectionMask);
      
      modifyMask(point, baseMask, selectionMode !== 'subtract');
      
      setSelectionMask(baseMask);
      lastPointRef.current = point;
    } else if (tool === 'text') {
      setTextPosition(point);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
      const point = getCanvasCoordinates(e);
      if(point) setMousePos(point);

      if (tool !== 'brush' || !isPainting || !point || croppedImageData) return;
      
      const newMask = new Uint8ClampedArray(selectionMask!);
      const addToSelection = selectionMode !== 'subtract';
      
      if (lastPointRef.current) {
          const dist = Math.hypot(point.x - lastPointRef.current.x, point.y - lastPointRef.current.y);
          const steps = Math.max(1, Math.round(dist / (brushSize / 4)));
          for (let i = 0; i < steps; i++) {
              const t = i / steps;
              const interpX = Math.round(lastPointRef.current.x * (1 - t) + point.x * t);
              const interpY = Math.round(lastPointRef.current.y * (1 - t) + point.y * t);
              modifyMask({x: interpX, y: interpY}, newMask, addToSelection);
          }
      } else {
        modifyMask(point, newMask, addToSelection);
      }
      
      setSelectionMask(newMask);
      lastPointRef.current = point;
  };

  const handleMouseUp = () => {
    setIsPainting(false);
    lastPointRef.current = null;
  };

  const handleApplyText = () => {
    if (text && textPosition) {
        setAppliedTexts([...appliedTexts, { text, color: textColor, size: fontSize, pos: textPosition }]);
        setText('Hallo Welt');
        setTextPosition(null);
    }
  };

  const handleInvertSelection = () => {
    if (!selectionMask) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { width, height } = canvas;
    const invertedMask = new Uint8ClampedArray(width * height);
    for (let i = 0; i < selectionMask.length; i++) {
        invertedMask[i] = selectionMask[i] === 1 ? 0 : 1;
    }
    setSelectionMask(invertedMask);
  };

  const handleIsolateSelection = () => {
    if (!selectionMask) return;
    setIsLoading(true);
    setTimeout(() => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!ctx || !canvas || !imageRef.current) {
        setIsLoading(false);
        return;
      }

      const { width, height } = canvas;
      
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempCtx = tempCanvas.getContext('2d');
      if(!tempCtx) {
          setIsLoading(false);
          return;
      }
      // Draw only image before isolating, text will be an overlay
      tempCtx.drawImage(imageRef.current, 0, 0, width, height);
      const originalImageData = tempCtx.getImageData(0, 0, width, height);
      
      let minX = width, minY = height, maxX = 0, maxY = 0;

      const finalMask = applyGaussianBlur(selectionMask, width, height, edgeSmoothing);

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (selectionMask[y * width + x] === 1) { // Bounding box based on original sharp mask
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      
      if (minX > maxX) {
        setCroppedImageData(null);
        setIsLoading(false);
        return;
      }

      const cropWidth = maxX - minX + 1;
      const cropHeight = maxY - minY + 1;
      const newImageData = ctx.createImageData(cropWidth, cropHeight);
      
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            const maskValue = finalMask[y * width + x] / 255.0;
            if (maskValue > 0) {
              const oldPos = (y * width + x) * 4;
              const newPos = ((y - minY) * cropWidth + (x - minX)) * 4;
              newImageData.data[newPos] = originalImageData.data[oldPos];
              newImageData.data[newPos + 1] = originalImageData.data[oldPos + 1];
              newImageData.data[newPos + 2] = originalImageData.data[oldPos + 2];
              newImageData.data[newPos + 3] = originalImageData.data[oldPos + 3] * maskValue;
            }
        }
      }

      setCroppedImageData(newImageData);
      setIsLoading(false);
    }, 50);
  };
  
  useEffect(() => {
    if (!croppedImageData || !selectionBounds) return;

    const previewCanvas = previewCanvasRef.current;
    const previewCtx = previewCanvas?.getContext('2d');
    if (!previewCtx || !previewCanvas) return;
    
    const newWidth = croppedImageData.width * scale;
    const newHeight = croppedImageData.height * scale;
    previewCanvas.width = newWidth;
    previewCanvas.height = newHeight;
    
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = croppedImageData.width;
    tempCanvas.height = croppedImageData.height;
    const tempCtx = tempCanvas.getContext('2d');
    if(tempCtx) {
      tempCtx.putImageData(croppedImageData, 0, 0);
      previewCtx.clearRect(0, 0, newWidth, newHeight);
      previewCtx.imageSmoothingEnabled = true;
      previewCtx.imageSmoothingQuality = 'high';
      previewCtx.drawImage(tempCanvas, 0, 0, newWidth, newHeight);
      
      // Draw texts on top of the preview
      previewCtx.save();
      previewCtx.scale(scale, scale);
      appliedTexts.forEach(t => {
          const adjustedX = t.pos.x - selectionBounds.minX;
          const adjustedY = t.pos.y - selectionBounds.minY;
          previewCtx.font = `bold ${t.size}px sans-serif`;
          previewCtx.fillStyle = t.color;
          previewCtx.textBaseline = 'top';
          previewCtx.fillText(t.text, adjustedX, adjustedY);
      });
      previewCtx.restore();
    }
  }, [croppedImageData, scale, appliedTexts, selectionBounds]);
  
  const handleDownload = () => {
    if (!croppedImageData || !selectionBounds) return;

    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = croppedImageData.width;
    finalCanvas.height = croppedImageData.height;
    const finalCtx = finalCanvas.getContext('2d');
    if (!finalCtx) return;

    finalCtx.putImageData(croppedImageData, 0, 0);

    appliedTexts.forEach(t => {
        const adjustedX = t.pos.x - selectionBounds.minX;
        const adjustedY = t.pos.y - selectionBounds.minY;
        finalCtx.font = `bold ${t.size}px sans-serif`;
        finalCtx.fillStyle = t.color;
        finalCtx.textBaseline = 'top';
        finalCtx.fillText(t.text, adjustedX, adjustedY);
    });

    const link = document.createElement('a');
    link.download = 'ausgeschnittenes-bild.png';
    link.href = finalCanvas.toDataURL('image/png');
    link.click();
  };
  
  const traceBitmap = (imageData: ImageData): string | null => {
    const { width, height, data } = imageData;
    const isOpaque = (x: number, y: number): boolean => {
        if (x < 0 || x >= width || y < 0 || y >= height) return false;
        return data[(y * width + x) * 4 + 3] > 128;
    };

    let startPoint: Point | null = null;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
             if (isOpaque(x, y) && (y === 0 || !isOpaque(x, y - 1))) {
                startPoint = { x, y };
                break;
            }
        }
        if (startPoint) break;
    }

    if (!startPoint) return null;

    const path: Point[] = [];
    let p = startPoint;
    let dir = 0; // 0: up, 1: right, 2: down, 3: left
    
    const dx = [0, 1, 0, -1];
    const dy = [-1, 0, 1, 0];
    
    do {
      path.push({x: p.x, y: p.y});
      let turned = false;
      for (let i = 0; i < 4; ++i) {
        const nextDir = (dir + 3 + i) % 4;
        const nextX = p.x + dx[nextDir];
        const nextY = p.y + dy[nextDir];
        if (isOpaque(nextX, nextY)) {
          dir = nextDir;
          p = {x: nextX, y: nextY};
          turned = true;
          break;
        }
      }
      if (!turned) break;
    } while (p.x !== startPoint.x || p.y !== startPoint.y);
    
    if (path.length === 0) return null;
    return path.map((pt, i) => `${i === 0 ? 'M' : 'L'}${pt.x},${pt.y}`).join(' ') + ' Z';
  };


  const handleDownloadSVG = () => {
    if (!croppedImageData || !selectionBounds) return;
    
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = croppedImageData.width;
    tempCanvas.height = croppedImageData.height;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;
    tempCtx.putImageData(croppedImageData, 0, 0);
    const imageUrl = tempCanvas.toDataURL('image/png');
    const pathData = traceBitmap(croppedImageData);

    if (!pathData) {
      alert("Kontur konnte nicht gefunden werden, um SVG zu erstellen.");
      return;
    }
    
    const textElements = appliedTexts.map(t => {
      const adjustedX = t.pos.x - selectionBounds.minX;
      const adjustedY = t.pos.y - selectionBounds.minY;
      const sanitizedText = t.text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&apos;');
      // Use dominant-baseline="hanging" to align text top with the y coordinate, similar to canvas context.textBaseline = 'top'.
      return `<text x="${adjustedX}" y="${adjustedY}" font-family="sans-serif" font-size="${t.size}" font-weight="bold" fill="${t.color}" dominant-baseline="hanging">${sanitizedText}</text>`;
    }).join('\n  ');

    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${croppedImageData.width}" height="${croppedImageData.height}" viewBox="0 0 ${croppedImageData.width} ${croppedImageData.height}">
  <defs>
    <clipPath id="cutout-path">
      <path d="${pathData}" />
    </clipPath>
  </defs>
  <image href="${imageUrl}" width="${croppedImageData.width}" height="${croppedImageData.height}" clip-path="url(#cutout-path)" />
  ${textElements}
</svg>`;

    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ausgeschnittenes-bild.svg';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };


  const resetAll = () => {
    setSelectionMask(null);
    setCroppedImageData(null);
    setScale(1);
    setTolerance(20);
    setBrushSize(30);
    setTool('wand');
    setSelectionMode('new');
    setSelectionOpacity(40);
    setEdgeSmoothing(2);
    setAppliedTexts([]);
    setText('Hallo Welt');
    setTextPosition(null);
    setCanvasReady(false); // This will trigger re-mount and re-draw
    setCanvasReady(true);
  }

  return (
    <div className="p-4 md:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 flex items-center justify-center bg-slate-900/50 rounded-lg overflow-hidden relative aspect-video lg:aspect-auto">
        {isLoading && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-20">
            <div className="w-16 h-16 border-4 border-t-cyan-400 border-slate-700 rounded-full animate-spin"></div>
          </div>
        )}
        {isMouseInCanvas && tool === 'brush' && !croppedImageData && (
            <div
                className={`rounded-full border pointer-events-none absolute z-10 ${selectionMode === 'subtract' ? 'border-rose-500 bg-rose-500/20' : 'border-cyan-400 bg-cyan-400/20'}`}
                style={{
                    width: brushSize,
                    height: brushSize,
                    left: mousePos.x,
                    top: mousePos.y,
                    transform: 'translate(-50%, -50%)',
                }}
            />
        )}
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => { handleMouseUp(); setIsMouseInCanvas(false); }}
          onMouseEnter={() => setIsMouseInCanvas(true)}
          className={`transition-opacity duration-300 ${croppedImageData ? 'opacity-20 pointer-events-none' : 'opacity-100'} ${tool === 'brush' ? 'cursor-none' : tool === 'text' ? 'cursor-text' : 'cursor-crosshair'}`}
        />
      </div>

      <div className="flex flex-col space-y-6">
        <div className="p-4 bg-slate-800/60 rounded-lg border border-slate-700">
          <h2 className="text-lg font-bold mb-4 text-cyan-400">Steuerung</h2>
          {!croppedImageData ? (
            <div className="space-y-4">
              <div className="flex items-center justify-around p-1 bg-slate-900/70 rounded-lg">
                <button onClick={() => setTool('wand')} className={`px-4 py-1.5 rounded-md text-sm font-semibold w-full transition-colors ${tool === 'wand' ? 'bg-cyan-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}>Zauberstab</button>
                <button onClick={() => setTool('brush')} className={`px-4 py-1.5 rounded-md text-sm font-semibold w-full transition-colors ${tool === 'brush' ? 'bg-cyan-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}>Pinsel</button>
                <button onClick={() => setTool('text')} className={`px-4 py-1.5 rounded-md text-sm font-semibold w-full transition-colors ${tool === 'text' ? 'bg-cyan-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}>Text</button>
              </div>

              {(tool === 'wand' || tool === 'brush') && (
                <div className="flex items-center justify-center p-1 bg-slate-900/70 rounded-lg gap-1">
                  <button onClick={() => setSelectionMode('new')} title="Neue Auswahl" className={`p-2 rounded-md transition-colors ${selectionMode === 'new' ? 'bg-cyan-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}><NewSelectionIcon className="w-5 h-5"/></button>
                  <button onClick={() => setSelectionMode('add')} title="Zur Auswahl hinzufügen" className={`p-2 rounded-md transition-colors ${selectionMode === 'add' ? 'bg-cyan-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}><AddIcon className="w-5 h-5"/></button>
                  <button onClick={() => setSelectionMode('subtract')} title="Von Auswahl abziehen" className={`p-2 rounded-md transition-colors ${selectionMode === 'subtract' ? 'bg-cyan-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}><SubtractIcon className="w-5 h-5"/></button>
                </div>
              )}

              {tool === 'wand' && <ControlSlider id="tolerance" label="Toleranz" value={tolerance} min={0} max={100} step={1} onChange={e => setTolerance(Number(e.target.value))} icon={<WandIcon className="w-5 h-5"/>}/>}
              {tool === 'brush' && <ControlSlider id="brushSize" label="Pinselgröße" value={brushSize} min={2} max={100} step={1} onChange={e => setBrushSize(Number(e.target.value))} icon={<BrushIcon className="w-5 h-5"/>}/>}
              
              {tool === 'text' && (
                <div className="space-y-4 pt-2 border-t border-slate-700/50">
                    <div className="flex flex-col space-y-1">
                        <label htmlFor="text-input" className="flex items-center space-x-2 text-sm font-medium text-slate-300">
                            <TextIcon className="w-5 h-5"/>
                            <span>Textinhalt</span>
                        </label>
                        <input 
                            id="text-input"
                            type="text"
                            value={text}
                            onChange={e => setText(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                            placeholder="Text eingeben..."
                        />
                    </div>
                    <ControlSlider id="fontSize" label="Schriftgröße" value={fontSize} min={8} max={200} step={1} onChange={e => setFontSize(Number(e.target.value))} icon={<FontSizeIcon className="w-5 h-5"/>} unit="px" />
                    <div className="flex flex-col space-y-2">
                      <label htmlFor="textColor" className="flex items-center space-x-2 text-sm font-medium text-slate-300">
                        <BrushIcon className="w-5 h-5"/>
                        <span>Textfarbe</span>
                      </label>
                      <div className="flex items-center gap-2 p-1 bg-slate-700 rounded-lg border border-slate-600">
                         <input
                            id="textColor"
                            type="color"
                            value={textColor}
                            onChange={e => setTextColor(e.target.value)}
                            className="w-8 h-8 p-0 border-none bg-transparent appearance-none cursor-pointer"
                            style={{'WebkitAppearance': 'none', 'MozAppearance': 'none', 'appearance': 'none', 'backgroundColor': 'transparent', 'border': 'none', 'cursor': 'pointer'}}
                         />
                         <input type="text" value={textColor.toUpperCase()} onChange={e => setTextColor(e.target.value)} className="w-full bg-transparent font-mono text-cyan-400 focus:outline-none"/>
                      </div>
                    </div>
                    <p className="text-xs text-slate-400 italic">Klicken Sie auf das Bild, um den Text zu platzieren.</p>
                    <button
                        onClick={handleApplyText}
                        disabled={!text || !textPosition}
                        className="w-full bg-emerald-600 text-white font-bold py-2 px-4 rounded-lg flex items-center justify-center space-x-2 hover:bg-emerald-500 transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed"
                    >
                        <TextIcon className="w-5 h-5"/>
                        <span>Text anwenden</span>
                    </button>
                </div>
              )}

              {selectionMask && (
                <div className="space-y-4 pt-4 border-t border-slate-700/50">
                  <ControlSlider 
                    id="selectionOpacity" 
                    label="Deckkraft" 
                    value={selectionOpacity} 
                    min={0} max={100} 
                    step={1} 
                    onChange={e => setSelectionOpacity(Number(e.target.value))} 
                    icon={<OpacityIcon className="w-5 h-5"/>}
                    unit="%"
                  />
                  <ControlSlider 
                    id="edgeSmoothing" 
                    label="Kantenglättung" 
                    value={edgeSmoothing} 
                    min={0} max={30} 
                    step={1} 
                    onChange={e => setEdgeSmoothing(Number(e.target.value))} 
                    icon={<FeatherIcon className="w-5 h-5"/>}
                  />
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <button
                  onClick={handleIsolateSelection}
                  disabled={!selectionMask || isLoading}
                  className="w-full bg-cyan-600 text-white font-bold py-2 px-4 rounded-lg flex items-center justify-center space-x-2 hover:bg-cyan-500 transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed"
                >
                  <CutIcon className="w-5 h-5"/>
                  <span>Isolieren</span>
                </button>
                <button
                  onClick={handleInvertSelection}
                  disabled={!selectionMask || isLoading}
                  className="w-full bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg flex items-center justify-center space-x-2 hover:bg-indigo-500 transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed"
                >
                  <InvertIcon className="w-5 h-5"/>
                  <span>Umkehren</span>
                </button>
              </div>
            </div>
          ) : (
             <div className="space-y-4">
               <ControlSlider id="scale" label="Skalierung" value={scale} min={0.1} max={5} step={0.1} onChange={e => setScale(Number(e.target.value))} icon={<ScaleIcon className="w-5 h-5"/>}/>
                <div className="flex flex-col sm:flex-row gap-2">
                   <button
                    onClick={handleDownload}
                    className="w-full bg-emerald-600 text-white font-bold py-2 px-4 rounded-lg flex items-center justify-center space-x-2 hover:bg-emerald-500 transition-colors"
                  >
                    <DownloadIcon className="w-5 h-5"/>
                    <span>Als PNG laden</span>
                  </button>
                   <button
                    onClick={handleDownloadSVG}
                    className="w-full bg-purple-600 text-white font-bold py-2 px-4 rounded-lg flex items-center justify-center space-x-2 hover:bg-purple-500 transition-colors"
                  >
                    <DownloadSVGIcon className="w-5 h-5"/>
                    <span>Als SVG laden</span>
                  </button>
                </div>
            </div>
          )}
        </div>

        {croppedImageData && (
          <div className="p-4 bg-slate-800/60 rounded-lg border border-slate-700 flex-grow">
            <h2 className="text-lg font-bold mb-4 text-cyan-400">Vorschau</h2>
            <div className="flex items-center justify-center bg-checkered-pattern rounded-md p-2 min-h-[150px] overflow-auto">
              <canvas ref={previewCanvasRef} className="bg-transparent" />
            </div>
          </div>
        )}

        <div className="flex gap-4">
            <button
              onClick={resetAll}
              className="w-full bg-slate-700 text-slate-300 font-bold py-2 px-4 rounded-lg flex items-center justify-center space-x-2 hover:bg-slate-600 transition-colors"
            >
              <ResetIcon className="w-5 h-5"/>
              <span>Zurücksetzen</span>
            </button>
             <button
              onClick={onReset}
              className="w-full bg-rose-800 text-white font-bold py-2 px-4 rounded-lg flex items-center justify-center space-x-2 hover:bg-rose-700 transition-colors"
            >
              <span>Neues Bild</span>
            </button>
        </div>
      </div>
    </div>
  );
};