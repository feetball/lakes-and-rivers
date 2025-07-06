# Contributing to Lakes and Rivers

Thank you for your interest in contributing to the Lakes and Rivers project! This document provides guidelines and information for contributors.

## Getting Started

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/dk-texas-flood-overview.git
   cd dk-texas-flood-overview
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Set up your environment:
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your local Redis URL if needed
   ```

## Development Workflow

1. Create a new branch for your feature or bugfix:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes and test them:
   ```bash
   npm run dev  # Start development server
   npm run lint # Check for linting issues
   npm run build # Test production build
   ```

3. Commit your changes:
   ```bash
   git add .
   git commit -m "Add: brief description of your changes"
   ```

4. Push to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

5. Create a Pull Request on GitHub

## Code Style

- Use TypeScript for all new code
- Follow the existing code style (ESLint configuration)
- Use meaningful variable and function names
- Add comments for complex logic
- Keep components small and focused

## Commit Messages

Use clear, descriptive commit messages:
- `Add: new feature description`
- `Fix: bug description`
- `Update: enhancement description`
- `Refactor: code improvement description`

## Testing

- Test your changes locally before submitting
- Ensure the application builds successfully
- Check that all existing functionality still works
- Test with and without Redis cache

## Pull Request Guidelines

- Provide a clear description of the changes
- Reference any related issues
- Include screenshots for UI changes
- Ensure CI checks pass
- Be responsive to feedback

## Reporting Issues

When reporting bugs:
- Use a clear, descriptive title
- Describe steps to reproduce
- Include your environment details
- Add screenshots if applicable

## Feature Requests

- Check existing issues first
- Provide detailed use case
- Explain why the feature would be useful
- Consider implementation complexity

## Questions?

Feel free to open an issue for questions about contributing or project direction.

Thank you for contributing! 🚀
