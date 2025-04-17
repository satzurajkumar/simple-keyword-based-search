// server.js
// Load environment variables from .env file
const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 3001;

// --- Database Connection Pool ---
// Using a pool is recommended for managing connections efficiently
const pool = mysql.createPool({
	host: process.env.DB_HOST,
	user: process.env.DB_USER,
	password: process.env.DB_PASSWORD,
	database: process.env.DB_DATABASE,
	waitForConnections: true,
	connectionLimit: 10, // Adjust as needed
	queueLimit: 0,
});

// --- Middleware ---
app.use(cors());
app.use(express.json()); // To parse JSON request bodies (though not strictly needed for this GET request)

// --- API Endpoint for Autocomplete/Search Suggestions ---
app.get("/api/search/autocomplete", async (req, res) => {
	const query = req.query.query;
	const MIN_QUERY_LENGTH = 1;
	const MAX_QUERY_LENGTH = 100;

	// --- Input Validation and Basic Sanitization ---
	if (!query || typeof query !== "string") {
		return res.status(400).json({ error: "Invalid search query provided." });
	}
	const trimmedQuery = query.trim();
	if (
		trimmedQuery.length < MIN_QUERY_LENGTH ||
		trimmedQuery.length > MAX_QUERY_LENGTH
	) {
		return res.json([]);
	}

	// --- Sanitize specifically for Full-Text Boolean Mode ---
	const searchTerm = trimmedQuery;

	// Remove characters that have special meaning in BOOLEAN MODE.
	// Replace them with a space to avoid merging words, then trim again.
	// The set includes: + - < > ( ) ~ * " @
	const booleanModeSanitizedTerm = searchTerm
		.replace(/[+\-><()~*\"@]+/g, " ")
		.trim();

	// Re-check length after sanitization, in case the input was ONLY operators
	if (booleanModeSanitizedTerm.length < MIN_QUERY_LENGTH) {
		console.log("Query became too short after boolean mode sanitization.");
		return res.json([]);
	}

	// --- Proceed with Database Logic ---
	// Append the wildcard *after* sanitizing
	const fulltextTerm = booleanModeSanitizedTerm + "*";
	const suggestionsLimit = 10;

	let connection;
	try {
		connection = await pool.getConnection();
		const sql = `
            SELECT name
            FROM products
            WHERE MATCH(name) AGAINST(? IN BOOLEAN MODE)
            ORDER BY name ASC
            LIMIT ?`;

		const [results] = await connection.execute(sql, [
			fulltextTerm, // Use the sanitized term + wildcard
			String(suggestionsLimit),
		]);

		const suggestions = results.map((row) => row.name);
		res.json(suggestions);
	} catch (error) {
		console.error("Database query error:", error);
		// Log the term that caused the error for debugging if it persists
		// console.error('Term causing error:', fulltextTerm);
		res.status(500).json({ error: "Failed to fetch suggestions" });
	} finally {
		if (connection) {
			connection.release();
		}
	}
});

// --- Basic Root Route ---
app.get("/", (req, res) => {
	res.send("Simple Search Backend is running!");
});

// --- Start Server ---
app.listen(port, () => {
	console.log(`Server listening at http://localhost:${port}`);
});
