export class PointerManager {
  constructor(canvas) {
    this.width = canvas.width;
    this.height = canvas.height;
    this.x = 0;
    this.y = 0;
    this.prevX = 0;
    this.prevY = 0;
    this.isDragging = false;
    canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    canvas.addEventListener('mouseout', (e) => this.onMouseOut());
    canvas.addEventListener('touchmove', (e) => this.onTouchMove(e));
    canvas.addEventListener('touchend', (e) => this.onTouchEnd());
  }
  onMouseMove(e) {
    this.prevX = this.x;
    this.prevY = this.y;
    this.x = e.clientX / this.width;
    this.y = -e.clientY / this.height + 1;
    this.isDragging = e.buttons % 2 == 1;
  }
  onMouseOut() {
    this.isDragging = false;
  }
  onTouchMove(e) {
    e.preventDefault();
    this.prevX = this.x;
    this.prevY = this.y;
    const touch = e.touches[0];
    this.x = touch.clientX / this.width;
    this.y = -touch.clientY / this.height + 1;
    this.isDragging = true;
  }
  onTouchEnd() {
    this.isDragging = false;
  }
  get deltaX() { return this.x - this.prevX; }
  get deltaY() { return this.y - this.prevY; }
};
