
import React, { useCallback, useState } from 'react';
import { UploadIcon } from './Icons';

interface ImageUploaderProps {
  onImageUpload: (file: File) => void;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({ onImageUpload }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onImageUpload(e.target.files[0]);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      if(e.dataTransfer.files[0].type.startsWith('image/')) {
        onImageUpload(e.dataTransfer.files[0]);
      }
    }
  }, [onImageUpload]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);
  
  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  return (
    <div 
      className={`p-8 md:p-16 flex flex-col items-center justify-center text-center transition-all duration-300 ease-in-out ${isDragging ? 'bg-slate-700/50 scale-105' : 'bg-transparent'}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
    >
      <div className="border-2 border-dashed border-slate-600 rounded-xl p-8 md:p-12 w-full max-w-lg cursor-pointer hover:border-cyan-400 hover:bg-slate-800 transition-colors">
        <input
          type="file"
          id="file-upload"
          className="hidden"
          accept="image/*"
          onChange={handleFileChange}
        />
        <label htmlFor="file-upload" className="flex flex-col items-center justify-center cursor-pointer">
          <UploadIcon className="w-16 h-16 text-slate-500 mb-4 transition-colors group-hover:text-cyan-400" />
          <p className="text-xl font-semibold text-slate-300">Bild hochladen</p>
          <p className="text-slate-400 mt-2">
            Ziehen Sie eine Datei hierher oder klicken Sie, um sie auszuwählen.
          </p>
        </label>
      </div>
    </div>
  );
};
