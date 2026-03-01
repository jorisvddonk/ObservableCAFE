export class RecordingManager {
    constructor(chat) {
        this.chat = chat;
        this.isRecording = false;
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.recordingStartTime = null;
    }

    async toggle() {
        if (!this.chat.sessionId) {
            this.chat.uiManager.showWizardModal();
            return;
        }

        if (this.isRecording) {
            this.stop();
        } else {
            await this.start();
        }
    }

    async start() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: { 
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                } 
            });

            let mimeType = 'audio/webm';
            if (MediaRecorder.isTypeSupported('audio/mpeg')) {
                mimeType = 'audio/mpeg';
            } else if (MediaRecorder.isTypeSupported('audio/mp3')) {
                mimeType = 'audio/mp3';
            }

            this.mediaRecorder = new MediaRecorder(stream, { mimeType });
            this.recordedChunks = [];
            this.recordingStartTime = Date.now();

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                this.processRecording();
                stream.getTracks().forEach(track => track.stop());
            };

            this.mediaRecorder.start();
            this.isRecording = true;
            this.chat.updateUIState();

        } catch (error) {
            console.error('[RXCAFE] Error starting recording:', error);
            alert('Unable to access microphone. Please check your permissions.');
        }
    }

    stop() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            this.chat.updateUIState();
        }
    }

    async processRecording() {
        if (this.recordedChunks.length === 0) {
            console.warn('[RXCAFE] No audio recorded');
            return;
        }

        const audioBlob = new Blob(this.recordedChunks, { type: 'audio/webm' });
        const duration = (Date.now() - this.recordingStartTime) / 1000;

        console.log('[RXCAFE] Recording completed', {
            size: audioBlob.size,
            duration: duration.toFixed(2),
            mimeType: audioBlob.type
        });

        let mp3Blob;
        if (audioBlob.type === 'audio/mpeg') {
            mp3Blob = audioBlob;
        } else {
            console.log('[RXCAFE] Converting audio to MP3');
            mp3Blob = await this.convertToMP3(audioBlob);
        }

        await this.sendAudio(mp3Blob, duration);
    }

    async convertToMP3(audioBlob) {
        return new Promise((resolve, reject) => {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const arrayBuffer = e.target.result;
                    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                    const mp3Buffer = this.encodeToMP3(audioBuffer);
                    const mp3Blob = new Blob([mp3Buffer], { type: 'audio/mpeg' });
                    audioContext.close();
                    resolve(mp3Blob);
                } catch (error) {
                    console.error('[RXCAFE] Error decoding audio:', error);
                    audioContext.close();
                    reject(new Error('Failed to decode audio'));
                }
            };
            
            reader.onerror = (error) => {
                console.error('[RXCAFE] Error reading audio blob:', error);
                reject(new Error('Failed to read audio'));
            };
            
            reader.readAsArrayBuffer(audioBlob);
        });
    }

    encodeToMP3(audioBuffer) {
        const sampleRate = audioBuffer.sampleRate;
        const numChannels = audioBuffer.numberOfChannels;
        const samples = [];

        if (numChannels === 1) {
            const channelData = audioBuffer.getChannelData(0);
            const pcmData = this.floatTo16BitPCM(channelData);
            samples.push(pcmData);
        } else {
            const leftChannel = audioBuffer.getChannelData(0);
            const rightChannel = audioBuffer.getChannelData(1);
            const interleaved = new Float32Array(leftChannel.length * 2);
            
            for (let i = 0; i < leftChannel.length; i++) {
                interleaved[i * 2] = leftChannel[i];
                interleaved[i * 2 + 1] = rightChannel[i];
            }
            
            const pcmData = this.floatTo16BitPCM(interleaved);
            samples.push(pcmData);
        }

        const mp3Encoder = new lamejs.Mp3Encoder(numChannels, sampleRate, 128);
        const mp3Data = [];

        const chunkSize = 1152;
        for (let i = 0; i < samples[0].length; i += chunkSize) {
            const chunk = samples[0].subarray(i, i + chunkSize);
            const mp3Chunk = mp3Encoder.encodeBuffer(chunk);
            if (mp3Chunk.length > 0) {
                mp3Data.push(mp3Chunk);
            }
        }

        const finalChunk = mp3Encoder.flush();
        if (finalChunk.length > 0) {
            mp3Data.push(finalChunk);
        }

        return new Uint8Array(this.concatBuffers(mp3Data));
    }

    floatTo16BitPCM(input) {
        const output = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) {
            const s = Math.max(-1, Math.min(1, input[i]));
            output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return output;
    }

    concatBuffers(buffers) {
        let length = 0;
        for (let i = 0; i < buffers.length; i++) {
            length += buffers[i].length;
        }
        const result = new Uint8Array(length);
        let offset = 0;
        for (let i = 0; i < buffers.length; i++) {
            result.set(buffers[i], offset);
            offset += buffers[i].length;
        }
        return result;
    }

    async sendAudio(audioBlob, duration) {
        try {
            this.chat.isGenerating = true;
            this.chat.updateUIState();

            const arrayBuffer = await audioBlob.arrayBuffer();
            const audioData = new Uint8Array(arrayBuffer);

            const response = await fetch(this.chat.apiUrl(`/api/chat/${this.chat.sessionId}`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    audio: {
                        data: Array.from(audioData),
                        mimeType: audioBlob.type,
                        duration: duration.toFixed(2)
                    }
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            console.log('[RXCAFE] Audio chunk sent successfully', result);
            
        } catch (error) {
            console.error('[RXCAFE] Error sending audio:', error);
            this.chat.showError(`Failed to send audio: ${error.message}`);
        } finally {
            this.chat.isGenerating = false;
            this.chat.updateUIState();
        }
    }
}
