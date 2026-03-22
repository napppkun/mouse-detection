# Mouse’s Movement Detection and Analysis System

This project was developed to support behavioral experiment analysis by reducing manual observation and improving the consistency of result collection.  
The system integrates web application workflows with video analysis services to produce processed videos, trajectory data, and experiment summary reports.



## Key Features

- User authentication with **Google Sign-In** and **Email/Password**
- Mouse and daily record management
- Experiment/test management
- Template-based experiment configuration
- Video upload and trimming
- Automated video analysis pipeline
- Processed video generation
- Excel report generation
- Trajectory visualization
- Admin user management



## Supported Experiments

- **Elevated Plus Maze (EPM)** : Used to assess anxiety-related behavior by measuring time spent in open and closed arms.
- **Y-Maze** : Used to assess spatial working memory through arm entry tracking and alternation analysis.
- **Morris Water Maze (MWM)** :Used to assess spatial learning and memory through quadrant-based movement analysis.



## Tech Stack

### Frontend
- React
- React Router
- CSS
- Lucide React

### Backend
- Node.js
- Express.js
- Mongoose

### Analysis Service
- Python
- FastAPI
- OpenCV
- Pandas

### Database / Cloud Services
- MongoDB Atlas
- Firebase Authentication
- Google Cloud Storage



## System Architecture

The system consists of three main modules:

- **Frontend**: web interface for user interaction
- **Backend**: API server for business logic and database operations
- **Analysis Service**: video processing and behavior analysis service



## Main Workflow

1. User signs in to the system
2. User creates mouse and daily record data
3. User creates a test
4. User uploads videos
5. User configures the experiment template
6. User trims videos
7. User submits videos for analysis
8. System processes the videos
9. User reviews and downloads results



## Installation

### 1. Clone the Repository

```bash
git clone <your-repository-url>
cd <your-project-folder>
```

### 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

or

```bash
npm start
```

### 3. Backend Setup

```bash
cd backend
npm install
npm run dev
```

or

```bash
npm start
```

### 4. Analysis Service Setup

```bash
cd analysis_service
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

---

## Environment Variables

### Frontend

Create a `.env` file inside `frontend/`

```env
VITE_BACKEND_URL=http://localhost:5000
VITE_ANALYSIS_API=http://localhost:8000
```

If using Create React App:

```env
REACT_APP_BACKEND_URL=http://localhost:5000
REACT_APP_ANALYSIS_API=http://localhost:8000
```

### Backend

Create a `.env` file inside `backend/`

```env
PORT=5000
MONGO_URI=your_mongodb_atlas_uri
GOOGLE_CLOUD_PROJECT=your_project_id
GOOGLE_CLOUD_BUCKET=your_bucket_name
GOOGLE_CLOUD_KEY=your_service_account_json
ANALYSIS_API=http://localhost:8000
PROGRESS_SECRET=your_secret
FIREBASE_PROJECT_ID=your_firebase_project_id
```

### Analysis Service

Create a `.env` file inside `analysis_service/`

```env
BACKEND_URL=http://localhost:5000
FRONTEND_URL=http://localhost:3000
GOOGLE_CLOUD_BUCKET=your_bucket_name
PROGRESS_SECRET=your_secret
USE_CUDA=1
```



## Output Results

The system can generate:

* Processed video with tracking overlay
* Excel report
* Analysis metrics
* Trajectory data for visualization

### Example Metrics

#### Elevated Plus Maze

* Open arm 1
* Open arm 2
* Closed arm 1
* Closed arm 2
* Average open arm time
* Average closed arm time
* Absolute difference

#### Y-Maze

* A/B/C entries
* Total entries
* Number of alternations
* Alternation percentage
* Time spent in each arm

#### Morris Water Maze

* Time in Q1, Q2, Q3, and Q4
* Target quadrant
* Time spent in target quadrant



## Current Limitations

* Detection quality depends on video quality and mouse visibility
* Some videos may contain frames where the mouse is partially or fully undetected
* Trajectory visualization may be affected by imperfect model detection
* The system currently supports only three experiment types:

  * Elevated Plus Maze
  * Y-Maze
  * Morris Water Maze



## Future Improvements

* Improve model robustness for non-ideal videos
* Improve password reset and authentication flows
* Add support for more experiment types
* Extend admin management features
* Improve result dashboards and analytics



## Author

This project was developed as part of a research project focused on automated mouse movement detection and behavioral analysis.



## License

This project is intended for educational and research purposes.
