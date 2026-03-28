# TSA AccessAbility Hub

A comprehensive accessibility assistant web application with AI-powered features for vision and hearing support.

## Features

### ✅ Implemented Features

#### 📢 Text to Speech
- Play/Pause functionality for speech synthesis
- **Volume Control**: Adjust volume from 0-100%
- **Speed Control**: Adjust playback speed (0.5x - 2x)
- Uses `window.speechSynthesis` API with configurable rate parameter

#### 🎤 Speech to Text
- Start listening button
- Real-time speech recognition
- Append recognized text to textarea

#### 📹 Object Detection (Proximity Alert)
- Camera-based object detection
- **Proximity Beeping**: As objects get closer, beeping sound increases in frequency
- Real-time distance feedback
- Visual feedback on canvas

#### 🎨 Color & Light Detector
- **Color Detection**: Identifies dominant color in camera frame (Red, Green, Blue, Yellow, etc.)
- **Light Detection**: Detects ambient light level (Bright, Moderate, Dark)
- Real-time analysis with RGB values
- Camera-based analysis

#### 🖼️ AI Image Describer
- Upload images to get AI-generated descriptions
- Uses Salesforce BLIP image captioning model
- Backend processing with Flask

#### ♿ General Accessibility
- High contrast mode toggle
- Text size adjustment (increase/decrease)
- Responsive design
- Keyboard accessible button controls

## Setup Instructions

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Run the Application
```bash
python app.py
```

The application will start on `http://localhost:5000`

## API Endpoints

- `GET /` - Main web application
- `POST /describe_image` - AI image description endpoint
- `GET /health` - Health check

## File Structure
```
ClearPath/
├── app.py                 # Flask backend server
├── vision.html           # Main HTML file (legacy)
├── templates/
│   └── vision.html      # Flask template
├── requirements.txt      # Python dependencies
└── README.md            # This file
```

## Technology Stack

- **Frontend**: HTML5, CSS3, JavaScript
- **Backend**: Flask
- **AI Models**: Transformers (Salesforce BLIP for image captioning)
- **APIs**: Web Speech API, MediaDevices API, Web Audio API

## Browser Requirements

- Modern browser with support for:
  - MediaDevices API (cameras)
  - Web Speech API
  - Web Audio API
  - Canvas API
- Works best with: Chrome, Edge, Firefox

## Usage Tips

1. **Text to Speech**: Use the volume and speed sliders to adjust output
2. **Object Detection**: Keep camera steady for best proximity detection
3. **Color Detection**: Position objects directly in front of camera for accuracy
4. **Image Description**: Upload clear, well-lit images for best results

## Notes

- The application requires camera permissions
- Image captioning uses a pre-trained AI model
- Speech recognition works best in English
- All processing is done in real-time in the browser or on the backend server
