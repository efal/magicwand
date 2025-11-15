
import React, { useState } from 'react';
import { ImageUploader } from './components/ImageUploader';
import { ImageEditor } from './components/ImageEditor';
import { GithubIcon } from './components/Icons';

const App: React.FC = () => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);

  const handleImageUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        setImageSrc(e.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleReset = () => {
    setImageSrc(null);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 flex flex-col items-center justify-center p-4 font-sans">
      <header className="w-full max-w-6xl mx-auto p-4 flex justify-between items-center">
        <h1 className="text-2xl md:text-3xl font-bold text-cyan-400 tracking-tight">
          Magic Wand Bild-Editor
        </h1>
        <a href="https://github.com/google/prompt-gallery" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-cyan-400 transition-colors">
          <GithubIcon className="w-7 h-7" />
        </a>
      </header>
      
      <main className="w-full max-w-6xl flex-grow flex items-center justify-center">
        <div className="w-full bg-slate-800/50 rounded-2xl shadow-2xl shadow-cyan-500/10 backdrop-blur-sm border border-slate-700 overflow-hidden">
          {imageSrc ? (
            <ImageEditor imageSrc={imageSrc} onReset={handleReset} />
          ) : (
            <ImageUploader onImageUpload={handleImageUpload} />
          )}
        </div>
      </main>

       <footer className="w-full max-w-6xl mx-auto p-4 text-center text-slate-500 text-sm">
        <p>Laden Sie ein Bild hoch, um mit der Bearbeitung zu beginnen.</p>
      </footer>
    </div>
  );
};

export default App;
