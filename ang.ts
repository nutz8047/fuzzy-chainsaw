import { Component, ElementRef, ViewChild, OnInit, OnDestroy } from '@angular/core';
import Cropper from 'cropperjs';

@Component({
  selector: 'app-image-cropper',
  standalone: true,
  imports: [],
  templateUrl: './image-cropper.component.html',
  styleUrl: './image-cropper.component.css'
})
export class ImageCropperComponent implements OnInit, OnDestroy {
  @ViewChild('imageElement', { static: false }) imageElement!: ElementRef<HTMLImageElement>;

  private cropper!: Cropper;
  imageUrl = 'https://picsum.photos/id/1018/800/600';

  // Sticky crop box state management
  private originalCropData: any = null;
  private isUserInteracting: boolean = false;
  private originalCroppedSnapshot: string | null = null;
  cropBoxVisibilityState: 'fully-visible' | 'partially-visible' | 'out-of-bounds' = 'fully-visible';
  croppedImageDataUrl: string | null = null;

  ngOnInit() {

  }

  ngAfterViewInit() {
    this.initializeCropper();
  }

  private initializeCropper() {
    if (this.imageElement?.nativeElement) {
      this.cropper = new Cropper(this.imageElement.nativeElement, {
        viewMode: 1,
        aspectRatio: NaN,
        autoCropArea: 0.8,
        responsive: true,
        restore: true,
        guides: true,
        center: true,
        highlight: true,
        cropBoxMovable: true,
        cropBoxResizable: true,
        toggleDragModeOnDblclick: true,
        crop: (event) => {
          console.log('Crop data:', event.detail);
        },
        cropstart: () => {
          this.isUserInteracting = true;
        },
        cropend: () => {
          this.isUserInteracting = false;
          this.updateOriginalCropData();
          // Capture snapshot after user finishes interacting if crop box is fully visible
          this.updateSnapshotIfVisible();
        },
        zoom: () => {
          if (!this.isUserInteracting && this.originalCropData) {
            setTimeout(() => this.applyStickyPosition(), 0);
          }
        }
      });
    }
  }

  getCroppedImage() {
    // Always return the stored snapshot if available
    if (this.originalCroppedSnapshot) {
      this.croppedImageDataUrl = this.originalCroppedSnapshot;

      console.log('Returning stored snapshot:', {
        originalCropData: this.originalCropData,
        cropBoxVisibilityState: this.cropBoxVisibilityState,
        snapshotLength: this.originalCroppedSnapshot.length
      });

      return this.originalCroppedSnapshot;
    }

    // Fallback: try to get current crop if no snapshot exists
    if (this.cropper) {
      const canvas = this.cropper.getCroppedCanvas();
      const dataURL = canvas.toDataURL('image/png');

      this.croppedImageDataUrl = dataURL;

      console.log('No snapshot available, using current crop box (fallback):', {
        cropBoxVisibilityState: this.cropBoxVisibilityState
      });

      return dataURL;
    }

    return null;
  }

  getCropDataDisplay(): string {
    if (this.originalCropData) {
      return JSON.stringify(this.originalCropData, null, 2);
    }
    return 'No crop data available';
  }

  reset() {
    if (this.cropper) {
      this.cropper.reset();
      this.originalCropData = null;
      this.originalCroppedSnapshot = null;
      this.croppedImageDataUrl = null;
    }
  }

  clear() {
    if (this.cropper) {
      this.cropper.clear();
      this.originalCropData = null;
      this.originalCroppedSnapshot = null;
      this.croppedImageDataUrl = null;
    }
  }

  getFormattedStatus(): string {
    if (this.cropBoxVisibilityState === 'fully-visible') return 'Fully Visible';
    if (this.cropBoxVisibilityState === 'partially-visible') return 'Partially Visible';
    if (this.cropBoxVisibilityState === 'out-of-bounds') return 'Out of Bounds';
    return 'Unknown';
  }

  private updateOriginalCropData() {
    if (this.cropper) {
      this.originalCropData = this.cropper.getData();
      console.log('Updated original crop data:', this.originalCropData);
    }
  }

  private updateSnapshotIfVisible() {
    if (this.cropper) {
      // Simply check if current crop box is fully visible and capture snapshot
      const currentCropBoxData = this.cropper.getCropBoxData();
      const visibility = this.checkCropBoxVisibility(currentCropBoxData);

      if (visibility === 'fully-visible') {
        // Capture snapshot of current crop selection
        const canvas = this.cropper.getCroppedCanvas();
        this.originalCroppedSnapshot = canvas.toDataURL('image/png');

        console.log('Captured snapshot - crop box fully visible:', {
          cropBoxData: currentCropBoxData,
          originalCropData: this.originalCropData,
          snapshotLength: this.originalCroppedSnapshot.length
        });
      } else {
        console.log('Crop box not fully visible, snapshot not captured:', {
          visibility: visibility
        });
      }
    }
  }

  private applyStickyPosition() {
    if (!this.cropper || !this.originalCropData) return;

    const imageData = this.cropper.getImageData();
    const canvasData = this.cropper.getCanvasData();
    const containerData = this.cropper.getContainerData();

    // Calculate scale factors using canvasData (the image wrapper that scales)
    const scaleX = canvasData.width / canvasData.naturalWidth;
    const scaleY = canvasData.height / canvasData.naturalHeight;

    // Convert original image coordinates to current container coordinates using canvas position
    const newCropBoxData = {
      left: canvasData.left + (this.originalCropData.x * scaleX),
      top: canvasData.top + (this.originalCropData.y * scaleY),
      width: this.originalCropData.width * scaleX,
      height: this.originalCropData.height * scaleY
    };

    // Enhanced debug logging
    console.log('Sticky Position Debug:', {
      originalCropData: this.originalCropData,
      imageData: imageData,
      canvasData: canvasData,
      containerData: containerData,
      scaleX: scaleX,
      scaleY: scaleY,
      newCropBoxData: newCropBoxData
    });

    // Calculate clipped crop box that fits within viewport
    const clippedCropBoxData = this.calculateClippedCropBox(newCropBoxData, containerData);
    this.cropBoxVisibilityState = this.checkCropBoxVisibility(newCropBoxData);

    // Always show crop box (clipped to viewport or as 1x1 when completely out of bounds)
    this.cropper.setCropBoxData(clippedCropBoxData);

    console.log('Crop box updated:', {
      original: newCropBoxData,
      clipped: clippedCropBoxData,
      visibilityState: this.cropBoxVisibilityState
    });
  }

  private checkCropBoxVisibility(cropBoxData: any): 'fully-visible' | 'partially-visible' | 'out-of-bounds' {
    const containerData = this.cropper.getContainerData();

    // Check if completely outside container bounds
    if (cropBoxData.left + cropBoxData.width <= 0 ||
        cropBoxData.top + cropBoxData.height <= 0 ||
        cropBoxData.left >= containerData.width ||
        cropBoxData.top >= containerData.height ||
        cropBoxData.width < 10 || cropBoxData.height < 10) {
      return 'out-of-bounds';
    }

    // Check if fully visible within container
    if (cropBoxData.left >= 0 &&
        cropBoxData.top >= 0 &&
        cropBoxData.left + cropBoxData.width <= containerData.width &&
        cropBoxData.top + cropBoxData.height <= containerData.height) {
      return 'fully-visible';
    }

    // Otherwise it's partially visible
    return 'partially-visible';
  }

  private calculateClippedCropBox(originalCropBoxData: any, containerData: any): any {
    // Calculate intersection between original crop box and viewport
    const left = Math.max(originalCropBoxData.left, 0);
    const top = Math.max(originalCropBoxData.top, 0);
    const right = Math.min(originalCropBoxData.left + originalCropBoxData.width, containerData.width);
    const bottom = Math.min(originalCropBoxData.top + originalCropBoxData.height, containerData.height);

    // Calculate clipped dimensions
    const clippedWidth = Math.max(right - left, 0);
    const clippedHeight = Math.max(bottom - top, 0);

    // If no intersection (completely out of bounds), create 1x1 representation
    if (clippedWidth <= 0 || clippedHeight <= 0) {
      return this.createOutOfBoundsRepresentation(originalCropBoxData, containerData);
    }

    // Return clipped crop box
    return {
      left: left,
      top: top,
      width: clippedWidth,
      height: clippedHeight
    };
  }

  private createOutOfBoundsRepresentation(originalCropBoxData: any, containerData: any): any {
    // Position 1x1 crop box at the closest edge to indicate direction
    let left = 0;
    let top = 0;

    // Find closest edge
    if (originalCropBoxData.left >= containerData.width) {
      // Off right edge
      left = containerData.width - 1;
      top = Math.max(0, Math.min(originalCropBoxData.top, containerData.height - 1));
    } else if (originalCropBoxData.left + originalCropBoxData.width <= 0) {
      // Off left edge
      left = 0;
      top = Math.max(0, Math.min(originalCropBoxData.top, containerData.height - 1));
    } else if (originalCropBoxData.top >= containerData.height) {
      // Off bottom edge
      left = Math.max(0, Math.min(originalCropBoxData.left, containerData.width - 1));
      top = containerData.height - 1;
    } else if (originalCropBoxData.top + originalCropBoxData.height <= 0) {
      // Off top edge
      left = Math.max(0, Math.min(originalCropBoxData.left, containerData.width - 1));
      top = 0;
    }

    return {
      left: left,
      top: top,
      width: 0,
      height: 0
    };
  }

  private isWithinBounds(cropBoxData: any, canvasData: any): boolean {
    const visibility = this.checkCropBoxVisibility(cropBoxData);
    return visibility === 'fully-visible' || visibility === 'partially-visible';
  }

  ngOnDestroy() {
    if (this.cropper) {
      this.cropper.destroy();
    }
  }
}
