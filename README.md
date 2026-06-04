# A/A* Computer Science Conference Deadline Tracker

This repository contains a high-fidelity, interactive, and responsive web dashboard designed to compile, filter, and track upcoming deadlines for top-tier computer science conferences (**Rank A and A***) with deadlines starting from **June 2026 onwards**.

The application is completely static, self-contained, and ready for deployment to **GitHub Pages**.

---

## 🌟 Key Features

- **Rankings Filter**: View and toggle between CCF Rank A, CORE Rank A*, and CORE Rank A conferences.
- **Fields of Study**: Instantly filter by core computer science subfields (Artificial Intelligence, Databases, Software Engineering, Networks, Security, Systems, Theory, and Graphics).
- **Timezone Helper**: Detects your local timezone automatically and displays both the official deadline (usually AoE) and your localized equivalent side-by-side.
- **Real-Time Countdown Clocks**: Countdowns ticking down to the exact second for active submission milestones.
- **Milestones & Tracks**: Supports showing all tracks (Main, Industry, Demos) and abstract vs. full paper deadlines.
- **Add to Calendar**: Directly export deadlines to your Google Calendar or download a standard `.ics` file.
- **Space-themed UI**: Modern dark theme utilizing responsive layout components, micro-animations, and glassmorphic aesthetics.

---

## 📂 Project Structure

```
├── .github/workflows/deploy.yml   # Automatic GitHub Pages CI/CD workflow
├── README.md                      # Documentation & guides (this file)
├── conferences.json               # Aggregated database of filtered Rank A/A* conferences
├── fetch_data.py                  # Database generation & projection script
├── index.html                     # Frontend structure
├── index.css                      # Styling & design system tokens
└── index.js                      # Main application logic & timer triggers
```

---

## ⚙️ Setting Up & Running Locally

Since the application fetches data from a local JSON file (`conferences.json`), you must run it through a local HTTP server to avoid browser CORS policy blocking:

1.  **Clone the Repository**:
    ```bash
    git clone <your-repository-url>
    cd repo
    ```

2.  **Start a Local Development Server**:
    - **Using Python** (built-in):
      ```bash
      python3 -m http.server 8000
      ```
    - **Using Node.js / npm**:
      ```bash
      npx http-server -p 8000
      ```

3.  **Open in Browser**:
    Open your browser and navigate to `http://localhost:8000`.

---

## 🔄 Updating the Database

The database can be updated at any time by running the Python parser. The script automatically pulls data from the latest community-curated `ccf-deadlines` repository, filters conferences matching your ranking criteria, handles date thresholds, and outputs the result:

1.  **Ensure Requirements are Installed**:
    The script requires Python 3 and the `PyYAML` package. If PyYAML is missing, the script will attempt to install it automatically, or you can do it manually:
    ```bash
    pip install pyyaml
    ```

2.  **Run the Fetcher Script**:
    ```bash
    python3 fetch_data.py
    ```

3.  **Commit and Push**:
    If new deadlines are generated, commit the new `conferences.json` to the repo to update the hosted dashboard.

---

## 🚀 Hosting on GitHub Pages

The project is fully configured for automatic deployment:

1.  Go to your repository settings on GitHub.
2.  Navigate to the **Pages** tab.
3.  Under **Build and deployment**, select **GitHub Actions** as the source.
4.  Push any change to your `master` or `main` branch, and the included `.github/workflows/deploy.yml` workflow will automatically compile and deploy your site.
