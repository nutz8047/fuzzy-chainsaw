// Angular 18 Component with Integrated Sticky Crop Box
// Using CropperJS v1 constructor event callbacks directly
// This maintains crop box position relative to the image during zoom/pan operations

import { Component, ElementRef, OnDestroy, OnInit, ViewChild, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import Cropper from 'cropperjs';

@Component({
  selector: 'app-image-cropper',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="cropper-container">
      <div class="cropper-wrapper">
        <img #cropperImage 
             [src]="imageUrl()" 
             alt="Image to crop"
             style="max-width: 100%; display: block;">
      </div>
      
      <div class="controls">
        <button (click)="resetCropBox()">Reset Crop Box</button>
        
        <div class="zoom-controls">
          <button (click)="zoomIn()">Zoom In</button>
          <button (click)="zoomOut()">Zoom Out</button>
          <button (click)="zoomTo(1)">Reset Zoom</button>
        </div>
        
        <div class="move-controls">
          <button (click)="moveImage(-10, 0)">← Move Left</button>
          <button (click)="moveImage(10, 0)">Move Right →</button>
          <button (click)="moveImage(0, -10)">↑ Move Up</button>
          <button (click)="moveImage(0, 10)">Move Down ↓</button>
        </div>
        
        <div class="aspect-ratio-controls">
          <button (click)="setAspectRatio(16/9)">16:9</button>
          <button (click)="setAspectRatio(4/3)">4:3</button>
          <button (click)="setAspectRatio(1)">1:1</button>
          <button (click)="setAspectRatio(NaN)">Free</button>
        </div>
        
        <button (click)="getCroppedImage()" class="primary">Get Cropped Image</button>
      </div>
      
      <div class="crop-info" *ngIf="cropData()">
        <h4>Crop Data:</h4>
        <pre>{{ cropData() | json }}</pre>
        <p><strong>Sticky Mode:</strong> Always ON</p>
      </div>
    </div>
  `,
  styles: [`
    .cropper-container {
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    
    .cropper-wrapper {
      margin-bottom: 20px;
      border: 1px solid #ddd;
      border-radius: 4px;
      overflow: hidden;
    }
    
    .controls {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 20px;
    }
    
    .controls > div {
      display: flex;
      gap: 5px;
    }
    
    button {
      padding: 8px 12px;
      border: 1px solid #ddd;
      background: white;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.2s;
    }
    
    button:hover {
      background: #f5f5f5;
    }
    
    button.active {
      background: #007bff;
      color: white;
      border-color: #007bff;
    }
    
    button.primary {
      background: #28a745;
      color: white;
      border-color: #28a745;
    }
    
    button.primary:hover {
      background: #218838;
    }
    
    .crop-info {
      background: #f8f9fa;
      padding: 15px;
      border-radius: 4px;
      border: 1px solid #e9ecef;
    }
    
    .crop-info h4 {
      margin: 0 0 10px 0;
    }
    
    pre {
      margin: 0;
      font-size: 12px;
      overflow-x: auto;
    }
  `]
})
export class ImageCropperComponent implements OnInit, OnDestroy {
  @ViewChild('cropperImage', { static: true }) cropperImage!: ElementRef<HTMLImageElement>;
  
  private cropper: Cropper | null = null;
  
  // Sticky crop box state
  private relativeCropData: any = null;
  private isInternalUpdate = false;
  private lastCropEventTime = 0;
  
  // Signals for reactive state management
  imageUrl = signal('https://via.placeholder.com/800x600/4CAF50/white?text=Sample+Image');
  cropData = signal<any>(null);
  isInitialized = signal(false);
  
  // Computed values
  cropperStatus = computed(() => {
    return this.isInitialized() ? 'Ready' : 'Initializing...';
  });
  
  ngOnInit() {
    this.initializeCropper();
  }
  
  ngOnDestroy() {
    this.destroyCropper();
  }
  
  private initializeCropper() {
    if (!this.cropperImage?.nativeElement) {
      console.error('Cropper image element not found');
      return;
    }
    
    const imageElement = this.cropperImage.nativeElement;
    
    this.cropper = new Cropper(imageElement, {
      dragMode: 'move',
      aspectRatio: 16 / 9,
      autoCropArea: 0.6,
      viewMode: 1, // Restrict crop box to canvas
      
      // Event callbacks using CropperJS v1 API - sticky behavior is always enabled
      ready: () => {
        console.log('Cropper initialized successfully');
        this.isInitialized.set(true);
        
        // Initialize sticky behavior
        this.captureRelativePosition();
      },
      
      cropstart: (event: any) => {
        console.log('Crop operation started:', event.detail.action);
        
        if (this.isInternalUpdate) return;
        
        const action = event.detail.action;
        
        // If it's a move action (moving the canvas/image), prepare for sticky behavior
        if (action === 'move') {
          // Capture current relative position before move starts
          this.captureRelativePosition();
        }
      },
      
      cropmove: (event: any) => {
        if (this.isInternalUpdate) return;
        
        const action = event.detail.action;
        
        // Apply sticky behavior only when moving the canvas (image)
        if (action === 'move') {
          setTimeout(() => {
            this.applyRelativePosition();
          }, 10);
        }
        
        // Optional: Update crop data in real-time during movement (but not for image moves)
        if (action !== 'move') {
          this.updateCropData();
        }
      },
      
      cropend: (event: any) => {
        console.log('Crop operation ended:', event.detail.action);
        
        if (this.isInternalUpdate) return;
        
        const action = event.detail.action;
        
        // Update relative position after manual crop box adjustments
        if (action === 'all' || action.includes('e') || action.includes('w') || 
            action.includes('n') || action.includes('s') || action === 'crop') {
          // User manually adjusted crop box, update our relative position
          setTimeout(() => {
            this.captureRelativePosition();
          }, 10);
        }
        
        this.updateCropData();
      },
      
      crop: (event: any) => {
        // Update crop data whenever crop box changes
        this.cropData.set({
          x: Math.round(event.detail.x),
          y: Math.round(event.detail.y),
          width: Math.round(event.detail.width),
          height: Math.round(event.detail.height),
          rotate: event.detail.rotate,
          scaleX: event.detail.scaleX,
          scaleY: event.detail.scaleY
        });
        
        if (this.isInternalUpdate) return;
        
        // This is a backup to ensure we maintain stickiness during any crop changes
        // that might not be caught by other events
        const currentTime = Date.now();
        
        // Throttle this event to avoid excessive updates
        if (!this.lastCropEventTime || currentTime - this.lastCropEventTime > 50) {
          this.lastCropEventTime = currentTime;
          
          setTimeout(() => {
            // Check if this was triggered by image transformation vs crop box adjustment
            // We can't directly detect this, so we'll just ensure our relative position is current
            if (!this.isInternalUpdate) {
              this.captureRelativePosition();
            }
          }, 10);
        }
      },
      
      zoom: (event: any) => {
        console.log('Zoom event:', {
          ratio: event.detail.ratio,
          oldRatio: event.detail.oldRatio
        });
        
        // Optional: Limit zoom range
        if (event.detail.ratio > 3) {
          event.preventDefault(); // Prevent excessive zoom in
        }
        if (event.detail.ratio < 0.1) {
          event.preventDefault(); // Prevent excessive zoom out
        }
        
        if (!this.isInternalUpdate) {
          // Apply sticky behavior after zoom completes
          setTimeout(() => {
            this.applyRelativePosition();
          }, 10);
        }
      }
    });
  }
  
  private destroyCropper() {
    if (this.cropper) {
      this.cropper.destroy();
      this.cropper = null;
    }
  }
  
  private updateCropData() {
    if (this.cropper) {
      const data = this.cropper.getData(true); // Get rounded values
      this.cropData.set(data);
    }
  }
  
  // Sticky crop box functionality methods
  private captureRelativePosition() {
    if (!this.cropper) return;
    
    const imageData = this.cropper.getImageData();
    const cropBoxData = this.cropper.getCropBoxData();
    
    if (!imageData || !cropBoxData) return;
    
    // Calculate relative position and size as percentages
    this.relativeCropData = {
      leftPercent: (cropBoxData.left - imageData.left) / imageData.width,
      topPercent: (cropBoxData.top - imageData.top) / imageData.height,
      widthPercent: cropBoxData.width / imageData.width,
      heightPercent: cropBoxData.height / imageData.height
    };
    
    console.log('Captured relative position:', this.relativeCropData);
  }
  
  private applyRelativePosition() {
    if (!this.cropper || !this.relativeCropData || this.isInternalUpdate) return;
    
    const currentImageData = this.cropper.getImageData();
    if (!currentImageData) return;
    
    // Calculate new crop box position based on current image position
    const newCropBoxData = {
      left: currentImageData.left + (this.relativeCropData.leftPercent * currentImageData.width),
      top: currentImageData.top + (this.relativeCropData.topPercent * currentImageData.height),
      width: this.relativeCropData.widthPercent * currentImageData.width,
      height: this.relativeCropData.heightPercent * currentImageData.height
    };
    
    console.log('Applying sticky position:', newCropBoxData);
    
    // Prevent recursive updates
    this.isInternalUpdate = true;
    
    // Apply the new crop box position
    this.cropper.setCropBoxData(newCropBoxData);
    
    // Reset flag after a short delay to allow the update to complete
    setTimeout(() => {
      this.isInternalUpdate = false;
    }, 10);
  }
  
  // Public methods for component interaction
  resetCropBox() {
    if (this.cropper) {
      this.cropper.reset();
      
      // Recapture relative position after reset
      setTimeout(() => {
        this.captureRelativePosition();
      }, 100);
    }
  }
  
  zoomIn() {
    if (this.cropper) {
      this.cropper.zoom(0.1);
    }
  }
  
  zoomOut() {
    if (this.cropper) {
      this.cropper.zoom(-0.1);
    }
  }
  
  zoomTo(ratio: number) {
    if (this.cropper) {
      this.cropper.zoomTo(ratio);
    }
  }
  
  moveImage(offsetX: number, offsetY: number) {
    if (this.cropper) {
      this.cropper.move(offsetX, offsetY);
    }
  }
  
  setAspectRatio(ratio: number) {
    if (this.cropper) {
      this.cropper.setAspectRatio(ratio);
    }
  }
  
  getCroppedImage() {
    if (!this.cropper) return;
    
    const canvas = this.cropper.getCroppedCanvas({
      width: 800,
      height: 600,
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high'
    });
    
    // Convert to blob and create download link
    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'cropped-image.png';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    });
    
    // Also show in new window for preview
    const newWindow = window.open();
    if (newWindow) {
      newWindow.document.write(`
        <html>
          <head><title>Cropped Image</title></head>
          <body style="margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#f0f0f0;">
            <img src="${canvas.toDataURL()}" style="max-width:100%;max-height:100%;box-shadow:0 4px 8px rgba(0,0,0,0.2);">
          </body>
        </html>
      `);
    }
  }
  
  // Method to change image source
  changeImage(newImageUrl: string) {
    if (this.cropper) {
      this.imageUrl.set(newImageUrl);
      this.cropper.replace(newImageUrl);
      
      // Reset sticky crop box state
      setTimeout(() => {
        this.captureRelativePosition();
      }, 100);
    }
  }
}

// Usage example in app.component.ts:
/*
import { Component } from '@angular/core';
import { ImageCropperComponent } from './image-cropper.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ImageCropperComponent],
  template: `
    <div class="app-container">
      <h1>CropperJS with Sticky Crop Box</h1>
      <app-image-cropper></app-image-cropper>
    </div>
  `,
  styles: [`
    .app-container {
      padding: 20px;
      font-family: Arial, sans-serif;
    }
    
    h1 {
      text-align: center;
      color: #333;
      margin-bottom: 30px;
    }
  `]
})
export class AppComponent {}
*/
