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
      viewMode: 0, // Allow crop box to extend outside canvas - this might be the key!
      
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
        // Update crop data whenever crop box changes (no rounding)
        this.cropData.set({
          x: event.detail.x,
          y: event.detail.y,
          width: event.detail.width,
          height: event.detail.height,
          rotate: event.detail.rotate,
          scaleX: event.detail.scaleX,
          scaleY: event.detail.scaleY
        });
        
        if (this.isInternalUpdate) return;
        
        // This is a backup to ensure we maintain stickiness during any crop changes
        // that might not be caught by other events
        const currentTime = Date.now();
        
        // Throttle this event to avoid excessive updates, but capture position for zoom events
        if (!this.lastCropEventTime || currentTime - this.lastCropEventTime > 100) {
          this.lastCropEventTime = currentTime;
          
          // Always keep our relative position updated for manual crop box changes
          setTimeout(() => {
            if (!this.isInternalUpdate) {
              this.captureRelativePosition();
            }
          }, 20);
        }
      },
      
      zoom: (event: any) => {
        console.log('=== ZOOM EVENT START ===');
        console.log('Zoom event:', {
          ratio: event.detail.ratio,
          oldRatio: event.detail.oldRatio,
          originalEvent: event.detail.originalEvent?.type
        });
        
        // Optional: Limit zoom range
        if (event.detail.ratio > 3) {
          event.preventDefault(); // Prevent excessive zoom in
          return;
        }
        if (event.detail.ratio < 0.1) {
          event.preventDefault(); // Prevent excessive zoom out
          return;
        }
        
        // For zoom events, we need to handle differently
        if (!this.isInternalUpdate) {
          // Capture the relative position BEFORE zoom effect takes place
          console.log('About to capture relative position before zoom...');
          this.captureRelativePosition();
          
          // Apply sticky behavior after zoom completes
          setTimeout(() => {
            console.log('Applying sticky position after zoom...');
            this.applyRelativePosition();
            console.log('=== ZOOM EVENT END ===');
          }, 100);
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
      const data = this.cropper.getData(); // Get precise values without rounding
      this.cropData.set(data);
    }
  }
  
  // Sticky crop box functionality methods
  private captureRelativePosition() {
    if (!this.cropper) return;
    
    const imageData = this.cropper.getImageData();
    const cropBoxData = this.cropper.getCropBoxData();
    const canvasData = this.cropper.getCanvasData();
    const containerData = this.cropper.getContainerData();
    
    if (!imageData || !cropBoxData || !canvasData || !containerData) return;
    
    // Calculate relative position based on the actual visible image area
    // This accounts for the canvas (image wrapper) position and size
    const relativeLeft = (cropBoxData.left - canvasData.left) / canvasData.width;
    const relativeTop = (cropBoxData.top - canvasData.top) / canvasData.height;
    const relativeWidth = cropBoxData.width / canvasData.width;
    const relativeHeight = cropBoxData.height / canvasData.height;
    
    this.relativeCropData = {
      leftPercent: relativeLeft,
      topPercent: relativeTop,
      widthPercent: relativeWidth,
      heightPercent: relativeHeight,
      // Store reference data for debugging
      capturedAt: {
        image: { ...imageData },
        canvas: { ...canvasData },
        container: { ...containerData },
        cropBox: { ...cropBoxData }
      }
    };
    
    console.log('Captured relative position:', {
      cropBox: cropBoxData,
      canvas: canvasData,
      image: imageData,
      container: containerData,
      calculated: {
        leftPercent: relativeLeft,
        topPercent: relativeTop,
        widthPercent: relativeWidth,
        heightPercent: relativeHeight
      }
    });
  }
  
  private applyRelativePosition() {
    if (!this.cropper || !this.relativeCropData || this.isInternalUpdate) return;
    
    const currentCanvasData = this.cropper.getCanvasData();
    
    if (!currentCanvasData) return;
    
    // Calculate new crop box position based PURELY on relative position to the canvas
    const idealCropBoxData = {
      left: currentCanvasData.left + (this.relativeCropData.leftPercent * currentCanvasData.width),
      top: currentCanvasData.top + (this.relativeCropData.topPercent * currentCanvasData.height),
      width: this.relativeCropData.widthPercent * currentCanvasData.width,
      height: this.relativeCropData.heightPercent * currentCanvasData.height
    };
    
    console.log('Applying sticky position (no constraints):', {
      currentCanvas: currentCanvasData,
      relativeCropData: this.relativeCropData,
      idealCropBox: idealCropBoxData,
      beforeCropBox: this.cropper.getCropBoxData()
    });
    
    // Prevent recursive updates
    this.isInternalUpdate = true;
    
    // Apply the new crop box position
    this.cropper.setCropBoxData(idealCropBoxData);
    
    // Check what CropperJS actually set vs what we wanted
    const actualCropBoxData = this.cropper.getCropBoxData();
    const wasModified = (
      Math.abs(actualCropBoxData.left - idealCropBoxData.left) > 0.1 ||
      Math.abs(actualCropBoxData.top - idealCropBoxData.top) > 0.1 ||
      Math.abs(actualCropBoxData.width - idealCropBoxData.width) > 0.1 ||
      Math.abs(actualCropBoxData.height - idealCropBoxData.height) > 0.1
    );
    
    console.log('After applying sticky position:', {
      idealCropBox: idealCropBoxData,
      actualCropBox: actualCropBoxData,
      wasModifiedByCropper: wasModified,
      differences: {
        leftDiff: actualCropBoxData.left - idealCropBoxData.left,
        topDiff: actualCropBoxData.top - idealCropBoxData.top,
        widthDiff: actualCropBoxData.width - idealCropBoxData.width,
        heightDiff: actualCropBoxData.height - idealCropBoxData.height
      }
    });
    
    // If CropperJS modified our crop box, we might need to recalculate our relative data
    // to match what CropperJS actually allows
    if (wasModified) {
      console.warn('CropperJS modified our crop box data - this might be due to internal constraints');
      
      // Option 1: Accept what CropperJS set and update our relative data
      // This would make the crop box "snap" to CropperJS constraints
      // Uncomment the next line to enable this behavior:
      // this.updateRelativeDataFromActualCropBox(actualCropBoxData, currentCanvasData);
      
      // Option 2: Try to force our ideal position (might cause issues)
      // For now, we'll just log it and accept CropperJS constraints
    }
    
    // Reset flag after a short delay to allow the update to complete
    setTimeout(() => {
      this.isInternalUpdate = false;
    }, 20);
  }
  
  // Helper method to update relative data based on what CropperJS actually set
  private updateRelativeDataFromActualCropBox(actualCropBox: any, canvasData: any) {
    this.relativeCropData = {
      leftPercent: (actualCropBox.left - canvasData.left) / canvasData.width,
      topPercent: (actualCropBox.top - canvasData.top) / canvasData.height,
      widthPercent: actualCropBox.width / canvasData.width,
      heightPercent: actualCropBox.height / canvasData.height,
      capturedAt: {
        ...this.relativeCropData.capturedAt,
        canvas: { ...canvasData },
        cropBox: { ...actualCropBox }
      }
    };
    console.log('Updated relative data based on CropperJS constraints:', this.relativeCropData);
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
