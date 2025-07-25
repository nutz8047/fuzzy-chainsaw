import { Component, ElementRef, ViewChild, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import Cropper from 'cropperjs';

@Component({
  selector: 'app-image-cropper',
  standalone: true,
  imports: [],
  templateUrl: './image-cropper.component.html',
  styleUrl: './image-cropper.component.css'
})
export class ImageCropperComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('imageElement', { static: false }) imageElement!: ElementRef<HTMLImageElement>;

  private cropper!: Cropper;
  imageUrl = 'https://picsum.photos/id/1018/1600/1200';

  // Sticky crop box state management
  private originalCropData: any = null;
  private isUserInteracting: boolean = false;
  private originalCroppedSnapshot: string | null = null;
  private pendingDeltas: { x: number, y: number, width: number, height: number } = { x: 0, y: 0, width: 0, height: 0 };
  private hasUserMadeChanges: boolean = false;
  private hasDeferredUpdate: boolean = false;
  private lastCropDataBeforeUserChanges: any = null;
  private currentMovementDeltas: { x: number, y: number, width: number, height: number } = { x: 0, y: 0, width: 0, height: 0 };
  private currentCropSessionId: number = 0;
  private currentCropAction: string = '';
  cropBoxVisibilityState: 'fully-visible' | 'partially-visible' | 'out-of-bounds' = 'fully-visible';
  croppedImageDataUrl: string | null = null;

  // CTRL+drag functionality
  private isCtrlPressed: boolean = false;
  private isCtrlDragging: boolean = false;
  private lastMouseX: number = 0;
  private lastMouseY: number = 0;
  private boundHandleKeyDown = this.handleKeyDown.bind(this);
  private boundHandleKeyUp = this.handleKeyUp.bind(this);
  private boundHandleMouseDown = this.handleMouseDown.bind(this);
  private boundHandleMouseUp = this.handleMouseUp.bind(this);
  private boundHandleMouseMove = this.handleMouseMove.bind(this);


  ngOnInit() {
    this.setupKeyboardEventListeners();
  }

  ngAfterViewInit() {
    this.initializeCropper();
    this.setupMouseEventListeners();
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
        toggleDragModeOnDblclick: false,
        cropstart: (event) => {
          this.isUserInteracting = true;
          this.hasUserMadeChanges = true;
          // Generate new session ID for this crop operation to prevent cross-contamination
          this.currentCropSessionId = Date.now();
          // Reset current movement deltas at the start of each crop operation
          this.currentMovementDeltas = { x: 0, y: 0, width: 0, height: 0 };

          // Store the current action for use in cropmove
          this.currentCropAction = event.detail?.action;

          // CRITICAL: If this is a new crop operation (action = 'crop'), completely reset state
          if (event.detail?.action === 'crop') {
            // This is a completely new crop box, so clear all previous state
            this.originalCropData = null;
            this.pendingDeltas = { x: 0, y: 0, width: 0, height: 0 };
            this.hasDeferredUpdate = false;
          }

          // Capture the starting position for reference - use getData which is in original image coordinates
          this.lastCropDataBeforeUserChanges = this.cropper.getData();
        },
        cropmove: (event) => {
          // Track real-time movement deltas during the crop operation
          if (this.hasUserMadeChanges && this.lastCropDataBeforeUserChanges) {
            const currentCropData = this.cropper.getData();
            const currentCropBoxData = this.cropper.getCropBoxData();

            // Calculate deltas in original image coordinate space
            this.currentMovementDeltas = {
              x: currentCropData.x - this.lastCropDataBeforeUserChanges.x,
              y: currentCropData.y - this.lastCropDataBeforeUserChanges.y,
              width: currentCropData.width - this.lastCropDataBeforeUserChanges.width,
              height: currentCropData.height - this.lastCropDataBeforeUserChanges.height
            };

            // Only apply fixes when moving existing crop boxes (action = 'move')
            // Don't interfere with new crop creation (action = 'crop') or resizing (action = 'e', 'w', 'n', 's', etc.)
            const shouldApplyFix = this.originalCropData && 
                                  this.currentCropAction === 'move';

            if (shouldApplyFix) {
              const visibility = this.checkCropBoxVisibility(currentCropBoxData);

              // CRITICAL FIX: Only fix clipped dimensions when moving existing crop boxes
              if (visibility === 'fully-visible') {
                // Check if crop box is significantly smaller than crop data (indicating clipping)
                const expectedWidth = currentCropData.width;
                const expectedHeight = currentCropData.height;
                const actualWidth = currentCropBoxData.width;
                const actualHeight = currentCropBoxData.height;

                // Allow for small differences due to scaling, but detect significant clipping
                const widthRatio = actualWidth / expectedWidth;
                const heightRatio = actualHeight / expectedHeight;

                if (widthRatio < 0.9 || heightRatio < 0.9) {
                  console.log('CROPMOVE: Fixing clipped existing crop box during movement');
                  // Force CropperJS to show correct dimensions by setting the crop data
                  setTimeout(() => {
                    this.cropper.setData(currentCropData);
                  }, 0);
                }

                // Also handle deferred updates if they exist
                if (this.hasDeferredUpdate && this.pendingDeltas) {
                  // Apply pending deltas permanently to original crop data
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
                }
              }
            }
          }
        },
        cropend: (event) => {
          this.isUserInteracting = false;


          // Only update original crop data if user actually made changes
          if (this.hasUserMadeChanges) {
            const visibility = this.checkOriginalCropBoxVisibility();
            
            console.log('CROPEND: Processing crop operation', {
              action: this.currentCropAction,
              visibility: visibility,
              currentCropData: this.cropper.getData(),
              originalCropData: this.originalCropData,
              hasDeferredUpdate: this.hasDeferredUpdate,
              pendingDeltas: this.pendingDeltas
            });
            
            // Apply the zoom-like fix for all operations (but handle resize accumulation properly)
            const currentSessionId = this.currentCropSessionId;
            setTimeout(() => {
              // Only apply if we're still in the same crop session (same as zoom)
              if (currentSessionId === this.currentCropSessionId) {
                this.applyStickyPosition();
                this.checkForDeferredUpdate();
              }
            }, 0);

            if (visibility === 'fully-visible') {
              // When fully visible, the current crop data represents the user's true intent
              // This is a new baseline, so we completely reset all pending deltas
              const newCropData = this.cropper.getData();

              console.log('CROPEND: Updating baseline for fully visible crop box', {
                action: this.currentCropAction,
                oldOriginalData: this.originalCropData,
                newCropData: newCropData,
                hadPendingDeltas: this.hasDeferredUpdate
              });

              // Completely reset state for new crop box
              this.originalCropData = newCropData;
              this.pendingDeltas = { x: 0, y: 0, width: 0, height: 0 };
              this.hasDeferredUpdate = false;

            } else {
              // Only store deltas if we're modifying an existing crop box (not creating a new one)
              // Check if we have existing original crop data that matches what we started with
              if (this.lastCropDataBeforeUserChanges && this.originalCropData) {
                console.log('CROPEND: Accumulating deltas for partially visible crop box', {
                  action: this.currentCropAction,
                  currentMovementDeltas: this.currentMovementDeltas,
                  existingPendingDeltas: this.pendingDeltas,
                  existingHasDeferredUpdate: this.hasDeferredUpdate
                });

                // CRITICAL FIX: Accumulate deltas instead of replacing them
                // This allows multiple resize operations to build on each other
                if (this.hasDeferredUpdate) {
                  // We already have pending deltas, so ADD the new deltas to the existing ones
                  console.log('CROPEND: Adding to existing deltas');
                  this.pendingDeltas = {
                    x: this.pendingDeltas.x + this.currentMovementDeltas.x,
                    y: this.pendingDeltas.y + this.currentMovementDeltas.y,
                    width: this.pendingDeltas.width + this.currentMovementDeltas.width,
                    height: this.pendingDeltas.height + this.currentMovementDeltas.height
                  };
                } else {
                  // First operation, so store the deltas as-is
                  console.log('CROPEND: Storing initial deltas');
                  this.pendingDeltas = {
                    x: this.currentMovementDeltas.x,
                    y: this.currentMovementDeltas.y,
                    width: this.currentMovementDeltas.width,
                    height: this.currentMovementDeltas.height
                  };
                }

                this.hasDeferredUpdate = true;
                
                console.log('CROPEND: Final accumulated deltas:', this.pendingDeltas);
              } else {
                // This is a new crop box that happens to be partially visible
                // Treat it as a new baseline without deltas
                this.originalCropData = this.cropper.getData();
                this.pendingDeltas = { x: 0, y: 0, width: 0, height: 0 };
                this.hasDeferredUpdate = false;
              }
            }
            this.hasUserMadeChanges = false;
          }


          // Reset movement deltas after processing
          this.currentMovementDeltas = { x: 0, y: 0, width: 0, height: 0 };
          // Capture snapshot after user finishes interacting if crop box is fully visible
          this.updateSnapshotIfVisible();
        },
        zoom: () => {
          if (!this.isUserInteracting && this.originalCropData) {
            // Capture current session ID to prevent stale operations
            const currentSessionId = this.currentCropSessionId;
            setTimeout(() => {
              // Only apply if we're still in the same crop session
              if (currentSessionId === this.currentCropSessionId) {
                this.applyStickyPosition();
                // Check if we have a deferred update and crop box is now fully visible
                this.checkForDeferredUpdate();
              }
            }, 0);
          }
        }
      });
    }
  }

  getCroppedImage() {

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
      this.currentMovementDeltas = { x: 0, y: 0, width: 0, height: 0 };
      this.hasUserMadeChanges = false;
      this.hasDeferredUpdate = false;
      this.lastCropDataBeforeUserChanges = null;
      this.currentCropSessionId = 0;
      this.currentCropAction = '';
    }
  }

  clear() {
    if (this.cropper) {
      this.cropper.clear();
      this.originalCropData = null;
      this.originalCroppedSnapshot = null;
      this.croppedImageDataUrl = null;
      this.pendingDeltas = { x: 0, y: 0, width: 0, height: 0 };
      this.currentMovementDeltas = { x: 0, y: 0, width: 0, height: 0 };
      this.hasUserMadeChanges = false;
      this.hasDeferredUpdate = false;
      this.lastCropDataBeforeUserChanges = null;
      this.currentCropSessionId = 0;
      this.currentCropAction = '';
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

        // CRITICAL FIX: Re-apply sticky positioning to show crop box with proper full dimensions
        // This ensures the crop box visually transitions from clipped to full size
        this.applyStickyPosition();

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

    // Read current state to avoid stale values
    const currentHasDeferredUpdate = this.hasDeferredUpdate;
    const currentPendingDeltas = this.pendingDeltas;

    const effectiveOriginalData = currentHasDeferredUpdate ? {
      x: this.originalCropData.x + currentPendingDeltas.x,
      y: this.originalCropData.y + currentPendingDeltas.y,
      width: this.originalCropData.width + currentPendingDeltas.width,
      height: this.originalCropData.height + currentPendingDeltas.height
    } : {
      x: this.originalCropData.x,
      y: this.originalCropData.y,
      width: this.originalCropData.width,
      height: this.originalCropData.height
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

    // Read current state fresh each time to avoid stale closure issues
    const currentHasDeferredUpdate = this.hasDeferredUpdate;
    const currentPendingDeltas = { ...this.pendingDeltas };
    const currentOriginalCropData = { ...this.originalCropData };


    // CRITICAL FIX: If we have deferred updates but somehow the pendingDeltas don't make sense
    // with the originalCropData, skip this application (likely stale state)
    if (currentHasDeferredUpdate) {
      const effectiveWidth = currentOriginalCropData.width + currentPendingDeltas.width;
      const effectiveHeight = currentOriginalCropData.height + currentPendingDeltas.height;

      // If applying deltas would result in negative or extremely large dimensions, skip
      if (effectiveWidth <= 0 || effectiveHeight <= 0 ||
          effectiveWidth > 5000 || effectiveHeight > 5000 ||
          Math.abs(currentPendingDeltas.x) > 2000 || Math.abs(currentPendingDeltas.y) > 2000) {
        return;
      }
    }

    const canvasData = this.cropper.getCanvasData();
    const containerData = this.cropper.getContainerData();

    // Calculate scale factors using canvasData (the image wrapper that scales)
    const scaleX = canvasData.width / canvasData.naturalWidth;
    const scaleY = canvasData.height / canvasData.naturalHeight;

    // Use original coordinates plus any pending deltas (only if we have a deferred update)
    const effectiveOriginalData = currentHasDeferredUpdate ? {
      x: currentOriginalCropData.x + currentPendingDeltas.x,
      y: currentOriginalCropData.y + currentPendingDeltas.y,
      width: currentOriginalCropData.width + currentPendingDeltas.width,
      height: currentOriginalCropData.height + currentPendingDeltas.height
    } : {
      x: currentOriginalCropData.x,
      y: currentOriginalCropData.y,
      width: currentOriginalCropData.width,
      height: currentOriginalCropData.height
    };


    // Convert effective original coordinates to current container coordinates using canvas position
    // The canvasData.left/top already includes any image movement from cropper.move()
    const newCropBoxData = {
      left: canvasData.left + (effectiveOriginalData.x * scaleX),
      top: canvasData.top + (effectiveOriginalData.y * scaleY),
      width: effectiveOriginalData.width * scaleX,
      height: effectiveOriginalData.height * scaleY
    };

    // Update visibility state first
    this.cropBoxVisibilityState = this.checkOriginalCropBoxVisibility();

    // CRITICAL FIX: Use setData() instead of setCropBoxData() to maintain original dimensions
    // This prevents CropperJS v1 viewMode:1 from clipping the crop box to current viewport
    if (this.cropBoxVisibilityState === 'fully-visible') {
      // When fully visible, set the original image data which CropperJS will properly display
      this.cropper.setData(effectiveOriginalData);
    } else {
      // When partially visible, we still need to show a clipped version for visual feedback
      const clippedCropBoxData = this.calculateClippedCropBox(newCropBoxData, containerData);
      this.cropper.setCropBoxData(clippedCropBoxData);
    }
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
    this.removeKeyboardEventListeners();
    this.removeMouseEventListeners();
  }

  private setupKeyboardEventListeners() {
    document.addEventListener('keydown', this.boundHandleKeyDown);
    document.addEventListener('keyup', this.boundHandleKeyUp);
  }

  private removeKeyboardEventListeners() {
    document.removeEventListener('keydown', this.boundHandleKeyDown);
    document.removeEventListener('keyup', this.boundHandleKeyUp);
  }

  private setupMouseEventListeners() {
    if (this.imageElement?.nativeElement) {
      const cropperContainer = this.imageElement.nativeElement.closest('.cropper-container');
      if (cropperContainer) {
        cropperContainer.addEventListener('mousedown', this.boundHandleMouseDown);
        cropperContainer.addEventListener('mouseup', this.boundHandleMouseUp);
        cropperContainer.addEventListener('mousemove', this.boundHandleMouseMove);
      }
    }
  }

  private removeMouseEventListeners() {
    if (this.imageElement?.nativeElement) {
      const cropperContainer = this.imageElement.nativeElement.closest('.cropper-container');
      if (cropperContainer) {
        cropperContainer.removeEventListener('mousedown', this.boundHandleMouseDown);
        cropperContainer.removeEventListener('mouseup', this.boundHandleMouseUp);
        cropperContainer.removeEventListener('mousemove', this.boundHandleMouseMove);
      }
    }
  }

  private handleKeyDown(event: KeyboardEvent) {
    if (event.ctrlKey && !this.isCtrlPressed) {
      this.isCtrlPressed = true;
    }
  }

  private handleKeyUp(event: KeyboardEvent) {
    if (!event.ctrlKey && this.isCtrlPressed) {
      this.isCtrlPressed = false;
      this.isCtrlDragging = false;
    }
  }

  private handleMouseDown(event: Event) {
    const mouseEvent = event as MouseEvent;
    if (this.isCtrlPressed && mouseEvent.ctrlKey) {
      this.isCtrlDragging = true;
      this.lastMouseX = mouseEvent.clientX;
      this.lastMouseY = mouseEvent.clientY;

      // When starting CTRL+drag, commit any pending deltas to avoid coordinate conflicts
      // This prevents the crop box from "growing" due to stale delta calculations
      if (this.cropper && this.originalCropData && this.hasDeferredUpdate) {
        // Apply pending deltas to the original crop data
        this.originalCropData = {
          ...this.originalCropData,
          x: this.originalCropData.x + this.pendingDeltas.x,
          y: this.originalCropData.y + this.pendingDeltas.y,
          width: this.originalCropData.width + this.pendingDeltas.width,
          height: this.originalCropData.height + this.pendingDeltas.height
        };

        // Clear the deferred state since we've applied the deltas
        this.hasDeferredUpdate = false;
        this.pendingDeltas = { x: 0, y: 0, width: 0, height: 0 };
      }


      // Prevent default cropper behavior
      event.preventDefault();
      event.stopPropagation();
    }
  }

  private handleMouseUp(event: Event) {
    if (this.isCtrlDragging) {
      this.isCtrlDragging = false;

      // After manually moving the image, only update our reference points if the crop box is fully visible
      // This ensures we don't lose the sticky positioning when the crop box goes out of bounds
      if (this.originalCropData && this.cropper) {
        const visibility = this.checkOriginalCropBoxVisibility();

        if (visibility === 'fully-visible') {
          // Only update original crop data when fully visible - just like in the cropend handler
          const currentCropData = this.cropper.getData();
          this.originalCropData = currentCropData;

          // Also update snapshot since we're fully visible
          this.updateSnapshotIfVisible();
        }
        // If not fully visible, keep the existing originalCropData and let sticky positioning handle it
      }
    }
  }

  private handleMouseMove(event: Event) {
    const mouseEvent = event as MouseEvent;
    if (this.isCtrlDragging && this.cropper) {
      const deltaX = mouseEvent.clientX - this.lastMouseX;
      const deltaY = mouseEvent.clientY - this.lastMouseY;

      // Use cropper's move method to move the image
      this.cropper.move(deltaX, deltaY);

      this.lastMouseX = mouseEvent.clientX;
      this.lastMouseY = mouseEvent.clientY;

      // Apply sticky positioning to show where the original crop box should be
      // relative to the moved image position (deferred to avoid conflicts)
      if (this.originalCropData) {
        // Capture current session ID to prevent stale operations
        const currentSessionId = this.currentCropSessionId;
        setTimeout(() => {
          // Only apply if we're still in the same crop session and have crop data
          if (this.originalCropData && currentSessionId === this.currentCropSessionId) {
            this.applyStickyPosition();
          } else if (currentSessionId !== this.currentCropSessionId) {
          }
        }, 0);
      }

      // Prevent default behavior
      event.preventDefault();
      event.stopPropagation();
    }
  }
}
