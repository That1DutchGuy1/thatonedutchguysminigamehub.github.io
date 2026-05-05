document.addEventListener('DOMContentLoaded', () => {
  var bupAudio = document.getElementById("bupAudio");
  var milestoneAudio = document.getElementById("milestoneAudio");
  const milestones = [
    { value: 100, description: "Noob," },
    { value: 1000, description: "Okay," },
    { value: 10000, description: "Nice," },
    { value: 25000, description: "That's crazy," },
    { value: 100000, description: "Bro go touch grass," },
    { value: 1000000, description: "What the hell," },
    { value: 5000000, description: "Stop already," },
    { value: 10000000, description: "You are insane,"},
    { value: 100000000, description: "Cheater,"},
    { value: 1000000000, description: "Turn off this game,"},
  ];

  function playBupAudio() {
    let sound = new Audio("bup.mp3");
    sound.play();
  }


let counter = parseInt(localStorage.getItem('bupScore')) || 0;
document.getElementById('score').innerText = counter;

const button = document.getElementById('button');
let holdInterval;

function incrementScore() {
  let soundEffect = new Audio("bup.mp3");
  soundEffect.play();
  
  counter++;
  localStorage.setItem('bupScore', counter);
  document.getElementById('score').innerText = counter;

  milestones.forEach(milestone => {
    if (counter === milestone.value) {
      milestoneAudio.currentTime = 0;
      milestoneAudio.play();
      document.getElementById('milestone').innerText =
        `Milestone reached: ${milestone.description} you've clicked the button ${milestone.value} times!`;
      document.getElementById('milestone').style.display = 'block';
      if (milestone.value === 1000000000) {
        setTimeout(() => {
          window.location.href = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
        }, 5000);
      } else {
        setTimeout(() => {
          document.getElementById('milestone').style.display = 'none';
        }, 7000);
      }
    }
  });
}

document.querySelector('.reset-button').addEventListener('click', resetScore);

function resetScore() {
  localStorage.removeItem('bupScore');
  counter = 0;
  document.getElementById('score').innerText = counter;
}

button.addEventListener('mousedown', () => {
  incrementScore(); // Immediate click
  holdInterval = setInterval(incrementScore, 500);
});

button.addEventListener('mouseup', () => clearInterval(holdInterval));
button.addEventListener('mouseleave', () => clearInterval(holdInterval));

});