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
  private pendingDeltas: { x: number, y: number, width: number, height: number } = { x: 0, y: 0, width: 0, height: 0 };
  private hasUserMadeChanges: boolean = false;
  private hasDeferredUpdate: boolean = false;
  private lastCropDataBeforeUserChanges: any = null;
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
        cropstart: () => {
          this.isUserInteracting = true;
          this.hasUserMadeChanges = true;
          // Capture crop data before user starts making changes
          this.lastCropDataBeforeUserChanges = this.cropper.getData();
        },
        cropend: () => {
          this.isUserInteracting = false;
          // Only update original crop data if user actually made changes AND crop box is fully visible
          if (this.hasUserMadeChanges) {
            const visibility = this.checkOriginalCropBoxVisibility();
            if (visibility === 'fully-visible') {
              // When fully visible, the current crop data represents the user's true intent
              this.originalCropData = this.cropper.getData();
            } else {
              // Calculate what the user actually changed while partially visible
              const currentCropData = this.cropper.getData();
              const deltaX = currentCropData.x - this.lastCropDataBeforeUserChanges.x;
              const deltaY = currentCropData.y - this.lastCropDataBeforeUserChanges.y;
              const deltaWidth = currentCropData.width - this.lastCropDataBeforeUserChanges.width;
              const deltaHeight = currentCropData.height - this.lastCropDataBeforeUserChanges.height;

              // Store the deltas to apply later
              this.pendingDeltas = {
                x: deltaX,
                y: deltaY,
                width: deltaWidth,
                height: deltaHeight
              };

              this.hasDeferredUpdate = true;
            }
            this.hasUserMadeChanges = false;
          }
          // Capture snapshot after user finishes interacting if crop box is fully visible
          this.updateSnapshotIfVisible();
        },
        zoom: () => {
          if (!this.isUserInteracting && this.originalCropData) {
            setTimeout(() => {
              this.applyStickyPosition();
              // Check if we have a deferred update and crop box is now fully visible
              this.checkForDeferredUpdate();
            }, 0);
          }
        }
      });
    }
  }

  getCroppedImage() {
    console.log('canvasData', this.cropper.getCanvasData());
    console.log('cropboxdata', this.cropper.getCropBoxData());
    console.log('croppedcanvas', this.cropper.getCroppedCanvas());
    console.log('getData', this.cropper.getData());

    console.log('containerData', this.cropper.getContainerData());
    console.log('getImageData', this.cropper.getImageData());

    // Always return the stored snapshot if available
    if (this.originalCroppedSnapshot) {
      this.croppedImageDataUrl = this.originalCroppedSnapshot;

      return this.originalCroppedSnapshot;
    }

    // Fallback: try to get current crop if no snapshot exists
    if (this.cropper) {
      const canvas = this.cropper.getCroppedCanvas();
      const dataURL = canvas.toDataURL('image/png');

      this.croppedImageDataUrl = dataURL;

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
      this.pendingDeltas = { x: 0, y: 0, width: 0, height: 0 };
      this.hasUserMadeChanges = false;
      this.hasDeferredUpdate = false;
      this.lastCropDataBeforeUserChanges = null;
    }
  }

  clear() {
    if (this.cropper) {
      this.cropper.clear();
      this.originalCropData = null;
      this.originalCroppedSnapshot = null;
      this.croppedImageDataUrl = null;
      this.pendingDeltas = { x: 0, y: 0, width: 0, height: 0 };
      this.hasUserMadeChanges = false;
      this.hasDeferredUpdate = false;
      this.lastCropDataBeforeUserChanges = null;
    }
  }

  private checkForDeferredUpdate() {
    if (this.hasDeferredUpdate && this.cropper && this.originalCropData) {
      const visibility = this.checkOriginalCropBoxVisibility();
      if (visibility === 'fully-visible') {
        // Now we can permanently apply the deltas to the original crop data
        const oldOriginalData = { ...this.originalCropData };
        const appliedDeltas = { ...this.pendingDeltas };

        this.originalCropData = {
          ...this.originalCropData,
          x: this.originalCropData.x + this.pendingDeltas.x,
          y: this.originalCropData.y + this.pendingDeltas.y,
          width: this.originalCropData.width + this.pendingDeltas.width,
          height: this.originalCropData.height + this.pendingDeltas.height
        };

        // Clear the deferred state
        this.hasDeferredUpdate = false;
        this.pendingDeltas = { x: 0, y: 0, width: 0, height: 0 };

        // Also update snapshot since we're now fully visible
        this.updateSnapshotIfVisible();
      }
    }
  }

  getFormattedStatus(): string {
    if (this.cropBoxVisibilityState === 'fully-visible') return 'Fully Visible';
    if (this.cropBoxVisibilityState === 'partially-visible') return 'Partially Visible';
    if (this.cropBoxVisibilityState === 'out-of-bounds') return 'Out of Bounds';
    return 'Unknown';
  }

  private checkOriginalCropBoxVisibility(): 'fully-visible' | 'partially-visible' | 'out-of-bounds' {
    if (!this.cropper || !this.originalCropData) {
      // If no original data, fall back to checking current crop box
      const currentCropBoxData = this.cropper?.getCropBoxData();
      return currentCropBoxData ? this.checkCropBoxVisibility(currentCropBoxData) : 'out-of-bounds';
    }

    const canvasData = this.cropper.getCanvasData();

    // Calculate where the effective original crop box (with pending deltas) would appear
    const scaleX = canvasData.width / canvasData.naturalWidth;
    const scaleY = canvasData.height / canvasData.naturalHeight;

    const effectiveOriginalData = {
      x: this.originalCropData.x + this.pendingDeltas.x,
      y: this.originalCropData.y + this.pendingDeltas.y,
      width: this.originalCropData.width + this.pendingDeltas.width,
      height: this.originalCropData.height + this.pendingDeltas.height
    };

    const theoreticalCropBox = {
      left: canvasData.left + (effectiveOriginalData.x * scaleX),
      top: canvasData.top + (effectiveOriginalData.y * scaleY),
      width: effectiveOriginalData.width * scaleX,
      height: effectiveOriginalData.height * scaleY
    };

    // Now check visibility of the theoretical crop box (not the clipped version)
    return this.checkCropBoxVisibility(theoreticalCropBox);
  }


  private updateSnapshotIfVisible() {
    if (this.cropper) {
      // Check if original crop box area is fully visible and capture snapshot
      const visibility = this.checkOriginalCropBoxVisibility();

      if (visibility === 'fully-visible') {
        // Capture snapshot of current crop selection
        const canvas = this.cropper.getCroppedCanvas();
        this.originalCroppedSnapshot = canvas.toDataURL('image/png');
      }
    }
  }

  private applyStickyPosition() {
    if (!this.cropper || !this.originalCropData) return;

    const canvasData = this.cropper.getCanvasData();
    const containerData = this.cropper.getContainerData();

    // Calculate scale factors using canvasData (the image wrapper that scales)
    const scaleX = canvasData.width / canvasData.naturalWidth;
    const scaleY = canvasData.height / canvasData.naturalHeight;

    // Use original coordinates plus any pending deltas
    const effectiveOriginalData = {
      x: this.originalCropData.x + this.pendingDeltas.x,
      y: this.originalCropData.y + this.pendingDeltas.y,
      width: this.originalCropData.width + this.pendingDeltas.width,
      height: this.originalCropData.height + this.pendingDeltas.height
    };

    // Convert effective original coordinates to current container coordinates using canvas position
    const newCropBoxData = {
      left: canvasData.left + (effectiveOriginalData.x * scaleX),
      top: canvasData.top + (effectiveOriginalData.y * scaleY),
      width: effectiveOriginalData.width * scaleX,
      height: effectiveOriginalData.height * scaleY
    };

    // Calculate clipped crop box that fits within viewport
    const clippedCropBoxData = this.calculateClippedCropBox(newCropBoxData, containerData);
    this.cropBoxVisibilityState = this.checkOriginalCropBoxVisibility();

    // Always show crop box (clipped to viewport or as 1x1 when completely out of bounds)
    this.cropper.setCropBoxData(clippedCropBoxData);
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

  ngOnDestroy() {
    if (this.cropper) {
      this.cropper.destroy();
    }
  }
}
