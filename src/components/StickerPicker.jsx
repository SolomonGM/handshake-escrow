import { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { toast } from '../utils/toast';

const defaultStickerImports = import.meta.glob(
  '../assets/stickers/*.{png,gif,jpg,jpeg,webp}',
  { eager: true, import: 'default' }
);

const defaultStickerUrls = Object.entries(defaultStickerImports)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, url]) => url);

const API_URL = import.meta.env.VITE_API_URL || '/api';

const StickerPicker = ({ onSelect, onClose }) => {
  const [activeTab, setActiveTab] = useState('default'); // 'default' or 'upload'
  const [defaultStickers, setDefaultStickers] = useState([]);
  const [uploadedStickers, setUploadedStickers] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef(null);

  // Load default stickers from assets folder
  useEffect(() => {
    setDefaultStickers(defaultStickerUrls);
  }, []);

  // Load uploaded stickers from backend
  useEffect(() => {
    const fetchUserStickers = async () => {
      const token = localStorage.getItem('token');
      if (!token) return;

      try {
        const response = await fetch(`${API_URL}/stickers`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (response.ok) {
          const stickers = await response.json();
          setUploadedStickers(stickers);
        }
      } catch (error) {
        console.error('Failed to load custom stickers:', error);
      }
    };

    fetchUserStickers();
  }, []);

  // Save uploaded sticker to backend
  const saveUploadedSticker = async (sticker) => {
    const token = localStorage.getItem('token');
    if (!token) {
      toast.warning('You must be signed in to upload custom stickers');
      return false;
    }

    try {
      const response = await fetch(`${API_URL}/stickers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(sticker)
      });

      if (response.ok) {
        const data = await response.json();
        setUploadedStickers(data.stickers);
        return true;
      } else {
        const error = await response.json();
        toast.error(error.message || 'Failed to save sticker');
        return false;
      }
    } catch (error) {
      console.error('Failed to save custom sticker:', error);
      toast.error('Failed to save sticker. Please try again.');
      return false;
    }
  };

  // Resize image to fit chat dimensions (120x120)
  const resizeImage = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          // Create canvas
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          // Set dimensions (120x120)
          const maxSize = 120;
          canvas.width = maxSize;
          canvas.height = maxSize;
          
          // Calculate scaling to maintain aspect ratio
          const scale = Math.min(maxSize / img.width, maxSize / img.height);
          const scaledWidth = img.width * scale;
          const scaledHeight = img.height * scale;
          
          // Center image on canvas
          const x = (maxSize - scaledWidth) / 2;
          const y = (maxSize - scaledHeight) / 2;
          
          // Draw image
          ctx.fillStyle = 'transparent';
          ctx.fillRect(0, 0, maxSize, maxSize);
          ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
          
          // Convert to data URL
          canvas.toBlob((blob) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              resolve(reader.result);
            };
            reader.readAsDataURL(blob);
          }, 'image/png', 0.9);
        };
        
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = e.target.result;
      };
      
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  };

  // Handle file upload
  const handleFileUpload = async (files) => {
    if (!files || files.length === 0) return;
    
    setIsProcessing(true);
    
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Validate file type
        if (!file.type.startsWith('image/')) {
          toast.warning(`${file.name} is not an image file`);
          continue;
        }
        
        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
          toast.warning(`${file.name} is too large (max 5MB)`);
          continue;
        }
        
        // Resize and convert to data URL
        const resizedImage = await resizeImage(file);
        const newSticker = {
          id: `${Date.now()}_${i}`,
          name: file.name,
          data: resizedImage
        };

        // Save to backend
        const success = await saveUploadedSticker(newSticker);
        if (!success) {
          break; // Stop if one fails
        }
      }
    } catch (error) {
      console.error('Failed to process images:', error);
      toast.error('Failed to process some images. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    await handleFileUpload(files);
  };

  // Delete uploaded sticker
  const deleteSticker = async (id) => {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      const response = await fetch(`${API_URL}/stickers/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setUploadedStickers(data.stickers);
      } else {
        toast.error('Failed to delete sticker');
      }
    } catch (error) {
      console.error('Failed to delete sticker:', error);
      toast.error('Failed to delete sticker. Please try again.');
    }
  };

  return (
    <div className="absolute bottom-full left-0 mb-2 w-96 bg-n-7 border border-n-6 rounded-lg shadow-xl overflow-hidden z-50">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-n-6">
        <h4 className="text-n-1 font-semibold text-sm">Stickers</h4>
        <button onClick={onClose} className="text-n-4 hover:text-n-1 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-2 border-b border-n-6">
        <button
          onClick={() => setActiveTab('default')}
          className={`px-4 py-1.5 rounded text-xs font-semibold transition-colors ${
            activeTab === 'default'
              ? 'bg-color-4 text-n-8'
              : 'bg-n-6 text-n-3 hover:bg-n-5'
          }`}
        >
          Default ({defaultStickers.length})
        </button>
        <button
          onClick={() => setActiveTab('upload')}
          className={`px-4 py-1.5 rounded text-xs font-semibold transition-colors ${
            activeTab === 'upload'
              ? 'bg-color-4 text-n-8'
              : 'bg-n-6 text-n-3 hover:bg-n-5'
          }`}
        >
          Custom ({uploadedStickers.length})
        </button>
      </div>

      {/* Content */}
      <div className="p-3 h-80 overflow-y-auto custom-scrollbar">
        {activeTab === 'default' ? (
          // Default Stickers
          <div className="grid grid-cols-4 gap-2">
            {defaultStickers.map((url, idx) => (
              <button
                key={idx}
                onClick={() => {
                  onSelect(url);
                  onClose();
                }}
                className="aspect-square rounded-lg overflow-hidden hover:ring-2 hover:ring-color-4 transition-all hover:scale-105 bg-n-6"
              >
                <img
                  src={url}
                  alt={`Sticker ${idx + 1}`}
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    // Hide broken image
                    e.target.parentElement.style.display = 'none';
                  }}
                />
              </button>
            ))}
            {defaultStickers.length === 0 && (
              <div className="col-span-4 text-center py-8">
                <p className="text-n-4 text-sm">No default stickers available</p>
                <p className="text-n-5 text-xs mt-1">Add stickers to /src/assets/stickers/</p>
              </div>
            )}
          </div>
        ) : (
          // Upload Area + Custom Stickers
          <div className="space-y-3">
            {/* Upload Area */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                isDragging
                  ? 'border-color-4 bg-color-4/10'
                  : 'border-n-6 hover:border-n-5'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => handleFileUpload(e.target.files)}
                className="hidden"
              />
              
              {isProcessing ? (
                <div className="flex flex-col items-center gap-2">
                  <svg className="animate-spin h-8 w-8 text-color-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <p className="text-n-3 text-sm">Processing images...</p>
                </div>
              ) : (
                <>
                  <svg className="mx-auto h-12 w-12 text-n-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="mt-2 text-sm text-n-3">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="text-color-4 hover:text-color-4/80 font-semibold"
                    >
                      Click to upload
                    </button>
                    {' or drag & drop'}
                  </p>
                  <p className="text-xs text-n-5 mt-1">PNG, JPG, GIF up to 5MB</p>
                  <p className="text-xs text-n-5">Auto-resized to 120x120px</p>
                </>
              )}
            </div>

            {/* Custom Stickers Grid */}
            {uploadedStickers.length > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {uploadedStickers.map((sticker) => (
                  <div key={sticker.id} className="relative group">
                    <button
                      onClick={() => {
                        onSelect(sticker.data);
                        onClose();
                      }}
                      className="aspect-square w-full rounded-lg overflow-hidden hover:ring-2 hover:ring-color-4 transition-all hover:scale-105 bg-n-6"
                    >
                      <img
                        src={sticker.data}
                        alt={sticker.name}
                        className="w-full h-full object-contain"
                      />
                    </button>
                    <button
                      onClick={() => deleteSticker(sticker.id)}
                      className="absolute top-1 right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete sticker"
                    >
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

StickerPicker.propTypes = {
  onSelect: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default StickerPicker;
