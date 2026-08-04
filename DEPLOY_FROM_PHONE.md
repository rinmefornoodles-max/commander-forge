# Deploy from an Android phone

## 1. Put the project on GitHub

1. Unzip this project on your phone.
2. Create a new GitHub repository.
3. Upload the contents of this folder, not the outer ZIP file.
4. Confirm that `app.py`, `requirements.txt`, `runtime.txt`, and the `.streamlit` folder are at the repository root.

## 2. Deploy with Streamlit Community Cloud

1. Sign in to Streamlit Community Cloud with GitHub.
2. Create a new app.
3. Select your repository and the `main` branch.
4. Set the main file path to `app.py`.
5. Deploy.

No API keys are required. The site retrieves public card information from Scryfall and official deck metadata from MTGJSON.

## 3. Add the site to your phone

Open the deployed address in Chrome, open the three-dot menu, and choose **Add to Home screen**.

## Updating the website

Edit a file in GitHub or GitHub Codespaces and commit the change. Streamlit redeploys the website from the updated repository.
