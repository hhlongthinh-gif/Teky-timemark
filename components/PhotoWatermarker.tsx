import React, { useEffect, useRef } from 'react';
import { CapturedImage } from '../types';

interface PhotoWatermarkerProps {
  image: CapturedImage;
  onProcessed: (dataUrl: string) => void;
}

const PhotoWatermarker: React.FC<PhotoWatermarkerProps> = ({ image, onProcessed }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = image.originalDataUrl;

    img.onload = () => {
      // 1. Set Canvas Dimensions to match Image
      canvas.width = img.width;
      canvas.height = img.height;

      // 2. Draw Original Image
      ctx.drawImage(img, 0, 0);

      // 3. Prepare Metadata Text
      const dateStr = image.timestamp.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
      const timeStr = image.timestamp.toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit'
      });
      const fullTimeStr = `${timeStr} - ${dateStr}`;
      
      let coordsStr = "";
      if (image.location) {
        coordsStr = `${image.location.lat.toFixed(6)}, ${image.location.lng.toFixed(6)}`;
      }

      const addressStr = image.location?.address || "Đang cập nhật địa chỉ...";
      const personStr = `Người chụp: ${image.personnelName}`;
      const deviceStr = `Thiết bị: ${image.deviceName}`;

      // 4. Calculate Font Size based on Image Width (responsive watermark)
      const baseFontSize = Math.max(24, Math.floor(img.width * 0.035)); 
      const timeFontSize = Math.floor(baseFontSize * 1.5); 
      const smallFontSize = Math.floor(baseFontSize * 0.7);
      const padding = Math.floor(baseFontSize * 1.0);
      
      // 5. Setup Box Calculation
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      
      // Measure address text width and wrap if necessary
      const maxWidth = canvas.width * 0.9; // Max width 90% of image
      ctx.font = `bold ${baseFontSize}px Inter, sans-serif`;
      
      // Helper function to wrap text
      const wrapText = (text: string, fontSize: number, isBold: boolean = false) => {
        ctx.font = `${isBold ? 'bold' : ''} ${fontSize}px Inter, sans-serif`;
        const words = text.split(' ');
        const lines: string[] = [];
        let currentLine = words[0];

        for (let i = 1; i < words.length; i++) {
          const width = ctx.measureText(currentLine + " " + words[i]).width;
          if (width < maxWidth) {
            currentLine += " " + words[i];
          } else {
            lines.push(currentLine);
            currentLine = words[i];
          }
        }
        lines.push(currentLine);
        return lines;
      };

      const addressLines = wrapText(addressStr, baseFontSize, true);
      
      // Calculate Total Box Height
      const lineHeight = baseFontSize * 1.3;
      const smallLineHeight = smallFontSize * 1.4;
      
      const totalTextHeight = 
        (timeFontSize * 1.4) + // Time line
        (smallLineHeight) + // Person line
        (addressLines.length * lineHeight) + // Address lines
        (smallLineHeight) + // Coords line
        (padding * 2);

      // 6. Draw Gradient Background
      const gradientHeight = totalTextHeight + padding;
      const gradient = ctx.createLinearGradient(
        0, canvas.height - gradientHeight, 
        0, canvas.height
      );
      gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
      gradient.addColorStop(0.2, 'rgba(0, 0, 0, 0.5)');
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0.9)');

      ctx.fillStyle = gradient;
      ctx.fillRect(0, canvas.height - gradientHeight, canvas.width, gradientHeight);

      // 7. Draw Text (Bottom Up)
      const rightAnchor = canvas.width - padding;
      let currentY = canvas.height - padding;

      // -- Coords (Bottom)
      ctx.font = `${smallFontSize}px Inter, sans-serif`;
      ctx.fillStyle = '#cbd5e1'; // slate-300
      ctx.fillText(coordsStr, rightAnchor, currentY);
      currentY -= smallLineHeight;

      // -- Device (Hidden or small next to coords? Let's put it with Person)
      
      // -- Address (Middle, Bold, White)
      ctx.font = `bold ${baseFontSize}px Inter, sans-serif`;
      ctx.fillStyle = '#ffffff'; // white
      for (let i = addressLines.length - 1; i >= 0; i--) {
        ctx.fillText(addressLines[i], rightAnchor, currentY);
        currentY -= lineHeight;
      }
      
      // -- Personnel & Device (Above Address, Cyan/Yellow)
      ctx.font = `${smallFontSize}px Inter, sans-serif`;
      ctx.fillStyle = '#fbbf24'; // amber-400
      ctx.fillText(`${personStr} | ${deviceStr}`, rightAnchor, currentY);
      currentY -= smallLineHeight;
      
      // Extra spacing before time
      currentY -= (baseFontSize * 0.2);

      // -- Time (Top, Large, Blue)
      ctx.font = `bold ${timeFontSize}px Inter, sans-serif`;
      ctx.fillStyle = '#38bdf8'; // sky-400
      ctx.fillText(fullTimeStr, rightAnchor, currentY);

      // 8. Export
      const processedUrl = canvas.toDataURL('image/jpeg', 0.85); // slightly lower quality for faster upload
      onProcessed(processedUrl);
    };

  }, [image, onProcessed]);

  return <canvas ref={canvasRef} className="hidden" />;
};

export default PhotoWatermarker;