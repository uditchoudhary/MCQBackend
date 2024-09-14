const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const port = 3100;

app.use(cors());
app.use(bodyParser.json());

const upload = multer({ dest: 'uploads/' });

// Function to remove unwanted footers or extra text from the question
function cleanText(text) {
  const footerPattern = /PMI PMP Exam "Pass Any Exam\. Any Time\." - www\.actualtests\.com(?:\d+)?/g;
  const pageNumberPattern = /\d+$/g; // Match numbers at the end of the line (likely page numbers)
  return text.replace(footerPattern, '').replace(pageNumberPattern, '').trim();
}

// Function to remove "Answer" or "Explanation" from options
function cleanOptionText(optionText) {
  // Remove "Answer: X" and trailing whitespace from option text
  return optionText.replace(/Answer:.*$/, '').trim();
}

// Function to extract MCQs from PDF text
function extractMCQsFromText(pdfText) {
  const mcqArray = [];
  const lines = pdfText.split('\n');
  let currentMcq = {};
  let optionLetter = '';
  let readingOptions = false;

  lines.forEach((line) => {
    line = line.trim();

    // Detect question number (e.g., QUESTION NO: 126)
    if (line.startsWith('QUESTION NO:')) {
      if (currentMcq.questionNo && currentMcq.question) {
        mcqArray.push(currentMcq); // Save previous MCQ
      }
      const questionNo = line.split(':')[1].trim();
      currentMcq = { questionNo, question: '', options: {}, answer: '', explanation: '' };
      readingOptions = false; // Reset options flag for new question
      optionLetter = '';
    }

    // Detect the start of the options
    if (line.startsWith('A.') || line.startsWith('B.') || line.startsWith('C.') || line.startsWith('D.')) {
      optionLetter = line.charAt(0); // A, B, C, or D
      currentMcq.options[optionLetter] = ''; // Initialize the option
      readingOptions = true; // Start reading options
    }

    // Stop adding to the question if "Explanation:" is found
    if (line.startsWith('Explanation:')) {
      currentMcq.explanation = cleanText(line.split(':')[1].trim()); // Capture the explanation
      return; // Skip adding this line to the question
    }

    // Add to options or question based on the flag
    if (readingOptions && optionLetter) {
      const optionText = line.replace(/^[A-D]\.\s*/, ''); 
      currentMcq.options[optionLetter] += cleanOptionText(cleanText(optionText)) + ' ';
    } else if (!readingOptions && currentMcq.questionNo) {
      // Add lines to the question until options begin
      const cleanedLine = line.replace(/^QUESTION NO:\s*/, '');
      currentMcq.question += cleanText(cleanedLine) + ' ';
    }

    // Detect answer (e.g., Answer: A)
    if (line.startsWith('Answer:')) {
      currentMcq.answer = cleanText(line.split(':')[1].trim()); // Capture the answer
      readingOptions = false; // Stop reading options after "Answer"
    }
  });

  // Push the last MCQ to the array
  if (currentMcq.questionNo && currentMcq.question) {
    mcqArray.push(currentMcq);
  }

  return mcqArray;
}

// PDF Parsing route
app.post('/upload', upload.single('pdf'), async (req, res) => {
  try {
    const dataBuffer = req.file.path;
    const data = await pdfParse(dataBuffer);
    const pdfText = data.text;

    const mcqs = extractMCQsFromText(pdfText);
    const validMcqs = mcqs.filter(mcq => mcq.questionNo !== undefined);
    res.json(validMcqs);
  } catch (error) {
    console.error('Error parsing PDF:', error);
    res.status(500).send('Error processing the PDF.');
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
