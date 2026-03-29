from flask import Flask, render_template
import os

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('vision.html')

@app.route('/hearing')
def hearing():
    return render_template('hearing.html')

if __name__ == '__main__':
    os.makedirs('templates', exist_ok=True)

    import shutil
    if os.path.exists('vision.html'):
        shutil.copy('vision.html', 'templates/vision.html')
        print("✓ Copied vision.html → templates/vision.html")

    port = int(os.environ.get('PORT', 5000))
    print(f"✓ Starting server on http://localhost:{port}")
    try:
        app.run(debug=True, host='0.0.0.0', port=port)
    except OSError:
        app.run(debug=True, host='0.0.0.0', port=5001)