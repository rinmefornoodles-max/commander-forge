name: Deploy The Commander Forge

on:
  push:
    branches: [main]
  workflow_dispatch:
  schedule:
    # Refresh the bundled official precon catalog every day.
    - cron: '23 10 * * *'

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: github-pages
  cancel-in-progress: true

jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - name: Download repository
        uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.12'

      - name: Build same-origin official precon catalog
        run: python build_precons.py

      - name: Configure GitHub Pages
        uses: actions/configure-pages@v5

      - name: Upload website files
        uses: actions/upload-pages-artifact@v3
        with:
          path: .

      - name: Deploy website
        id: deployment
        uses: actions/deploy-pages@v4
