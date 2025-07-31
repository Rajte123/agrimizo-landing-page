import dotenv from "dotenv";
dotenv.config();
import express from "express";
import session from "express-session";
import path from "path";
import multer from "multer";
import { fileURLToPath } from "url";


// const pool = new Pool({
//   user: 'postgres',
//   host: 'localhost',
//   database: 'agritech',
//   password: '123456789',
//   port: 5432,
// });




import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});


const app = express();
const port = 3000;

// Middleware
app.use(session({
  secret: '12345', // change this to something secure
  resave: false,
  saveUninitialized: true
}));
app.use(express.urlencoded({ extended: true }));
app.set("view engine", "ejs");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Multer
const storage = multer.diskStorage({
  destination: './public/uploads',
  filename: (req, file, cb) => {
    cb(null, 'proposed-' + Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

// Middleware for authentication
function checkAdmin(req, res, next) {
  if (req.session.admin) {
    next();
  } else {
    res.redirect("/admin/login");
  }
}

// Route

app.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM current_projects ORDER BY id DESC");
    res.render("index", { allProjects: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/current-project/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("SELECT * FROM current_projects WHERE id = $1", [id]);
    if (result.rows.length === 0) return res.status(404).send("Project not found");
    res.render("sections/CurrentProject/CurrentProject", { project: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
});

// app.get("/team", (req, res) => {
//   res.render("sections/team/ourteams", { project: { title: "Meet Our Team" } });
// });


// Admin Login
app.get("/admin/login", (req, res) => {
  res.render("admin/login", { error: null });
});

app.post("/admin/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query("SELECT * FROM admin_login WHERE username = $1 AND password = $2", [username, password]);
    if (result.rows.length > 0) {
      req.session.admin = true;
      res.redirect("/admin/current-project");
    } else {
      res.render("admin/login", { error: "Invalid username or password" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

app.get("/admin/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/admin/login");
});

// Admin Dashboard
app.get('/admin/current-project', checkAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM current_projects ORDER BY id DESC');
    const allProjects = result.rows.map(p => ({
      ...p,
      objectives: Array.isArray(p.objectives) ? p.objectives : p.objectives.split(','),
      outcomes: Array.isArray(p.outcomes) ? p.outcomes : p.outcomes.split(',')
    }));
    res.render('admin/current_project_form', { allProjects });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading page');
  }
});

app.post('/admin/current-project', checkAdmin, upload.single('architecture'), async (req, res) => {
  const { title, objectives, outcomes, link } = req.body;
  const architecture = req.file.filename;

  try {
    await pool.query(
      'INSERT INTO current_projects (title, objectives, outcomes, proposed_architecture, link) VALUES ($1, $2, $3, $4, $5)',
      [title, objectives.split(';'), outcomes.split(';'), architecture, link]
    );
    res.redirect('/admin/current-project'); // ✅ This was missing
  } catch (err) {
    console.error("Insert failed:", err);
    res.status(500).send("Insert failed");
  }
});


app.post('/admin/current-project/update/:id', checkAdmin, upload.single('architecture'), async (req, res) => {
  const { id } = req.params;
  const { title, objectives, outcomes, link } = req.body;
  try {
    if (req.file) {
      const architecture = req.file.filename;
      await pool.query(
        'UPDATE current_projects SET title=$1, objectives=$2, outcomes=$3, proposed_architecture=$4, link=$5 WHERE id=$6',
        [title, objectives.split(';'), outcomes.split(';'), architecture, link, id]
      );
    } else {
      await pool.query(
        'UPDATE current_projects SET title=$1, objectives=$2, outcomes=$3, link=$4 WHERE id=$5',
        [title, objectives.split(';'), outcomes.split(';'), link, id]
      );
    }    
    res.redirect('/admin/current-project');
  } catch (err) {
    console.error(err);
    res.status(500).send("Update failed");
  }
});

app.post('/admin/current-project/delete/:id', checkAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM current_projects WHERE id = $1', [id]);
    res.redirect('/admin/current-project');
  } catch (err) {
    console.error(err);
    res.status(500).send("Delete failed");
  }
});

app.listen(port, () => {
  console.log(`✅ Server is running on http://localhost:${port}`);
});
