export function editorTours({ image = false } = {}) {
  return [
    { id: image ? 'image-editor' : 'canvas-basics', title: 'Canvas basics', steps: [
      { target: '#view-editor #paint-canvas', title: 'Your canvas',
        text: 'Click or drag here to draw pixels. Pick a grid size at the top before you begin.' },
      { target: '#view-editor #toolset', title: 'Drawing tools',
        text: 'Pencil draws, Eraser removes, Fill colours an area, and Picker reuses a colour.' },
      { target: '#view-editor #palette', title: 'Colours',
        text: 'Choose a palette colour, enter a custom colour, or use the screen picker when your browser supports it.' },
      { target: '#view-editor #editor-filmstrip', title: 'Frames',
        text: 'Add or duplicate frames here to build an animation. Select a frame to edit it.' },
      { target: '#view-editor #btn-save', title: 'Save your work',
        text: 'Save a local copy, export a file, or sign in to keep a private cloud project.' },
      { target: '#view-editor #btn-publish', title: 'Publish',
        text: 'Sign in and publish a fixed copy of your artwork to the Gallery when you are ready to share it.' },
    ] },
    { id: image ? 'image-explore' : 'canvas-explore', title: 'Explore more', steps: [
      { target: '#view-editor #grid-size', title: 'Grid size',
        text: 'Choose how many pixels fit across the canvas. Larger grids allow more detail.' },
      { target: '#view-editor #btn-onion', title: 'Onion skin',
        text: 'Show earlier animation frames faintly behind the current one while you draw.' },
      { target: '#view-editor [data-tour="view-menu"]', title: 'View and replay',
        text: 'Open View to toggle grid lines or replay the steps that built your artwork.' },
      ...(!image ? [{ target: '#view-editor #btn-studio', title: 'PixelVerse Studio',
        text: 'Open the full animation workspace to draw, arrange frames, set speed, and export motion.' }] : []),
      { target: '#view-editor [data-tour="community-menu"]', title: 'Community',
        text: 'Open Community to browse the Gallery and your artwork activity.' },
      { target: '#view-editor [data-tour="create-menu"]', title: 'Create options',
        text: image ? 'Start a blank canvas or begin again from a different image.'
          : 'Create from an image to trace a pixel reference, or start a new canvas.' },
      { target: '#view-editor [data-account-open]', title: 'Your account',
        text: 'Sign in for cloud projects and publishing.' },
    ] },
  ];
}

export const studioTour = { id: 'studio', title: 'PixelVerse Studio', steps: [
  { target: '#view-studio #studio-toolset', title: 'Draw in Studio',
    text: 'Use the familiar Pencil, Eraser, Fill, and Picker tools to edit animation frames.' },
  { target: '#view-studio #studio-canvas', title: 'Frame preview',
    text: 'Draw directly on this frame. The preview shows your animation at full size.' },
  { target: '#view-studio #btn-play', title: 'Play your animation',
    text: 'Play, pause, loop, and step between frames here.' },
  { target: '#view-studio #studio-timeline', title: 'Arrange frames',
    text: 'Select, add, duplicate, delete, or drag frames to change the sequence.' },
  { target: '#view-studio #fps-options', title: 'Set the speed',
    text: 'FPS controls how quickly your animation plays.' },
  { target: '#view-studio #btn-studio-save', title: 'Save and export',
    text: 'Open Save for project copies and animation export options.' },
] };

export const referenceTours = [
  { id: 'reference-upload', title: 'Create from image', steps: [
    { target: '#ref-drop', title: 'Choose a picture',
      text: 'Drop an image here or click to browse. Your picture becomes a reference for drawing, not finished art.' },
  ] },
  { id: 'reference-settings', title: 'Make a pixel reference', steps: [
    { target: '#ref-size', title: 'Pick a resolution',
      text: 'Choose the pixel grid size for the reference you want to trace.' },
    { target: '#ref-colors', title: 'Choose colour detail',
      text: 'Limit the palette for a simpler pixel look, or choose No limit to keep more colours.' },
    { target: '#btn-ref-convert', title: 'Convert the picture',
      text: 'Press Convert to preview your picture as pixel art. You can adjust the settings and convert again.' },
    { target: '#btn-ref-use', title: 'Draw from it',
      text: 'Use the converted picture as a reference, then draw your own artwork in the editor.' },
  ] },
];

export const galleryTours = [
  { id: 'gallery', title: 'Gallery', steps: [
    { target: '#gallery-view .gallery-toolbar', title: 'Explore artwork',
      text: 'Browse recent work, Trending, Following, or the artwork you saved for later.' },
    { target: '#gallery-view .gallery-discovery', title: 'Find artwork',
      text: 'Search artwork by title, description, or tag. Open a post to save it to your private Saved art list.' },
    { target: '#gallery-view .gallery-search:not(.gallery-discovery)', title: 'Find artists',
      text: 'Search a display name or username. Artist profiles show public artwork, pixel avatars, featured art, and follower lists.' },
    { target: '#gallery-activity-button:not([hidden])', title: 'Your activity',
      text: 'See new followers, likes, and comments. Open an item or mark it read.' },
    { target: '#gallery-view .gallery-card', title: 'Open a post',
      text: 'Select an artwork to see its frames, artist, reactions, and comments.' },
    { target: '.gallery-topbar a[href="blank.html"]', title: 'Share your art',
      text: 'Create artwork in the editor, then use Publish to place a fixed copy in the Gallery.' },
  ] },
  { id: 'gallery-artwork', title: 'Artwork page', steps: [
    { target: '#gallery-view .gallery-art-wrap', title: 'View the artwork',
      text: 'Look at the finished pixel art. Use the frame arrows if the post has an animation.' },
    { target: '#gallery-view .gallery-info .gallery-actions', title: 'React or manage',
      text: 'Like or dislike another artist’s work. If this is your post, manage its visibility here.' },
    { target: '#gallery-view .gallery-comments', title: 'Talk about it',
      text: 'Read comments or sign in to leave your own. You can report inappropriate content.' },
  ] },
];
