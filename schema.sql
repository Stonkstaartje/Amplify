-- Amplify database schema voor Node.js backend
-- Importeer dit in je MySQL-database

CREATE TABLE tracks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    artist VARCHAR(200) NOT NULL DEFAULT 'Onbekend',
    album VARCHAR(200) NOT NULL DEFAULT '',
    duration_seconds INT NOT NULL DEFAULT 0,
    filename VARCHAR(255) NOT NULL,
    cover_filename VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FULLTEXT KEY search_idx (title, artist, album)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
