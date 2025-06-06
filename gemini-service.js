// Gemini API integration
const GEMINI_API_KEY = ''; // You'll need to add your API key here
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';

class GeminiService {
  constructor() {
    this.apiKey = GEMINI_API_KEY;
  }

  async generateTestSuggestions(steps) {
    try {
      const prompt = this._createTestSuggestionPrompt(steps);
      const response = await this._callGeminiAPI(prompt);
      return this._parseGeminiResponse(response);
    } catch (error) {
      console.error('Error generating test suggestions:', error);
      return null;
    }
  }

  async generateTestDescription(steps) {
    try {
      const prompt = this._createDescriptionPrompt(steps);
      const response = await this._callGeminiAPI(prompt);
      return this._parseGeminiResponse(response);
    } catch (error) {
      console.error('Error generating test description:', error);
      return null;
    }
  }

  async suggestAssertions(element, context) {
    try {
      const prompt = this._createAssertionPrompt(element, context);
      const response = await this._callGeminiAPI(prompt);
      return this._parseGeminiResponse(response);
    } catch (error) {
      console.error('Error suggesting assertions:', error);
      return null;
    }
  }

  async optimizeTest(testCode) {
    try {
      const prompt = this._createOptimizationPrompt(testCode);
      const response = await this._callGeminiAPI(prompt);
      return this._parseGeminiResponse(response);
    } catch (error) {
      console.error('Error optimizing test:', error);
      return null;
    }
  }

  async _callGeminiAPI(prompt) {
    const response = await fetch(`${GEMINI_API_URL}?key=${this.apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024,
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.statusText}`);
    }

    return await response.json();
  }

  _createTestSuggestionPrompt(steps) {
    return `As a test automation expert, analyze these recorded test steps and suggest improvements:

${JSON.stringify(steps, null, 2)}

Please provide:
1. Additional assertions that would make the test more robust
2. Potential edge cases to consider
3. Suggestions for test optimization
4. Any potential flakiness issues to address

Format the response as a JSON object with the following structure:
{
  "additionalAssertions": [],
  "edgeCases": [],
  "optimizationSuggestions": [],
  "flakinessWarnings": []
}`;
  }

  _createDescriptionPrompt(steps) {
    return `As a test automation expert, write a clear and descriptive test name and description for these recorded steps:

${JSON.stringify(steps, null, 2)}

The test should follow these guidelines:
1. Use clear, business-focused language
2. Include the main user journey being tested
3. Mention any important preconditions
4. Be specific about expected outcomes

Format the response as a JSON object:
{
  "testName": "",
  "testDescription": ""
}`;
  }

  _createAssertionPrompt(element, context) {
    return `As a test automation expert, suggest relevant assertions for this element in the context of a web application:

Element: ${JSON.stringify(element, null, 2)}
Context: ${JSON.stringify(context, null, 2)}

Consider:
1. Element type and role
2. User interactions
3. Business requirements
4. Common edge cases

Format the response as a JSON array of assertion objects:
[{
  "type": "assertion type",
  "description": "why this assertion is important",
  "code": "Playwright assertion code"
}]`;
  }

  _createOptimizationPrompt(testCode) {
    return `As a test automation expert, analyze this Playwright test and suggest optimizations:

${testCode}

Consider:
1. Test stability
2. Performance
3. Maintainability
4. Best practices

Format the response as a JSON object:
{
  "suggestions": [],
  "optimizedCode": "",
  "explanation": ""
}`;
  }

  _parseGeminiResponse(response) {
    try {
      const text = response.candidates[0].content.parts[0].text;
      return JSON.parse(text);
    } catch (error) {
      console.error('Error parsing Gemini response:', error);
      return null;
    }
  }
}

// Export a singleton instance
const geminiService = new GeminiService();
export default geminiService;
